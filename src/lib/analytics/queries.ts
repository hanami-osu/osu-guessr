import "server-only";

import { query } from "@/lib/database";

import { classifyWrongGuess, type WrongGuessKind } from "./guesses";
import { listBuckets, resolveRange, type AnalyticsRange, type BucketSize, type ResolvedRange } from "./range";

export const GAME_MODES = ["background", "audio", "skin", "score_pp"] as const;
export type AnalyticsGameMode = (typeof GAME_MODES)[number];

const MIN_ITEM_APPEARANCES = 3;
const DAY_MS = 86_400_000;

function bucketSql(column: string, bucket: BucketSize): string {
    return bucket === "week" ? `DATE_FORMAT(DATE_SUB(DATE(${column}), INTERVAL WEEKDAY(${column}) DAY), '%Y-%m-%d')` : `DATE_FORMAT(${column}, '%Y-%m-%d')`;
}

function ratio(part: number, whole: number): number | null {
    return whole > 0 ? part / whole : null;
}

// Overview

export interface Kpis {
    games: number;
    players: number;
    newUsers: number;
    rounds: number;
    accuracy: number | null;
    avgDurationSeconds: number | null;
    quitRate: number | null;
}

async function getKpis(from: Date, to: Date): Promise<Kpis> {
    const [[games], [users]] = await Promise.all([
        query<{ games: number; players: number; rounds: number; correct: number; avg_duration_s: number | null; quits: number }>(
            `SELECT COUNT(*) AS games, COUNT(DISTINCT user_id) AS players,
                COALESCE(SUM(rounds_played), 0) AS rounds,
                COALESCE(SUM(IF(rounds_played > 0, correct_count, 0)), 0) AS correct,
                AVG(IF(ended_at > started_at, TIMESTAMPDIFF(SECOND, started_at, ended_at), NULL)) AS avg_duration_s,
                COALESCE(SUM(end_reason = 'quit'), 0) AS quits
             FROM games WHERE ended_at >= ? AND ended_at < ?`,
            [from, to],
        ),
        query<{ new_users: number }>("SELECT COUNT(*) AS new_users FROM users WHERE created_at >= ? AND created_at < ?", [from, to]),
    ]);

    return {
        games: games.games,
        players: games.players,
        newUsers: users.new_users,
        rounds: games.rounds,
        accuracy: ratio(games.correct, games.rounds),
        avgDurationSeconds: games.avg_duration_s,
        quitRate: ratio(games.quits, games.games),
    };
}

export interface TimelinePoint {
    bucket: string;
    games: Record<AnalyticsGameMode, number>;
    players: number;
    signups: number;
}

async function getTimeline({ since, bucket }: ResolvedRange, now: Date): Promise<TimelinePoint[]> {
    const [games, players, signups] = await Promise.all([
        query<{ b: string; game_mode: AnalyticsGameMode; n: number }>(`SELECT ${bucketSql("ended_at", bucket)} AS b, game_mode, COUNT(*) AS n FROM games WHERE ended_at >= ? GROUP BY b, game_mode`, [since]),
        query<{ b: string; n: number }>(`SELECT ${bucketSql("ended_at", bucket)} AS b, COUNT(DISTINCT user_id) AS n FROM games WHERE ended_at >= ? GROUP BY b`, [since]),
        query<{ b: string; n: number }>(`SELECT ${bucketSql("created_at", bucket)} AS b, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY b`, [since]),
    ]);

    const points = new Map(listBuckets(since, now, bucket).map((key) => [key, { bucket: key, games: { background: 0, audio: 0, skin: 0, score_pp: 0 }, players: 0, signups: 0 } as TimelinePoint]));
    for (const row of games) {
        const point = points.get(row.b);
        if (point) point.games[row.game_mode] = row.n;
    }
    for (const row of players) {
        const point = points.get(row.b);
        if (point) point.players = row.n;
    }
    for (const row of signups) {
        const point = points.get(row.b);
        if (point) point.signups = row.n;
    }
    return [...points.values()];
}

export interface ModeVariantRow {
    gameMode: AnalyticsGameMode;
    variant: string;
    games: number;
    players: number;
    avgPoints: number;
    avgStreak: number;
    maxStreak: number;
    avgPp: number;
    avgRounds: number | null;
    accuracy: number | null;
    skipRate: number | null;
    timeoutRate: number | null;
    quitRate: number;
    failRate: number;
    exhaustedRate: number;
}

async function getModeVariants(since: Date): Promise<ModeVariantRow[]> {
    const rows = await query<{
        game_mode: AnalyticsGameMode;
        variant: string;
        games: number;
        players: number;
        avg_points: number;
        avg_streak: number;
        max_streak: number;
        avg_pp: number;
        avg_rounds: number | null;
        rounds: number;
        correct: number;
        skips: number;
        timeouts: number;
        quits: number;
        fails: number;
        exhausted: number;
    }>(
        `SELECT game_mode, variant, COUNT(*) AS games, COUNT(DISTINCT user_id) AS players,
            AVG(points) AS avg_points, AVG(streak) AS avg_streak, MAX(streak) AS max_streak, AVG(pp) AS avg_pp,
            AVG(NULLIF(rounds_played, 0)) AS avg_rounds,
            SUM(rounds_played) AS rounds, SUM(IF(rounds_played > 0, correct_count, 0)) AS correct,
            SUM(skip_count) AS skips, SUM(timeout_count) AS timeouts,
            SUM(end_reason = 'quit') AS quits, SUM(end_reason = 'failed') AS fails, SUM(end_reason = 'content_exhausted') AS exhausted
         FROM games WHERE ended_at >= ?
         GROUP BY game_mode, variant ORDER BY games DESC`,
        [since],
    );

    return rows.map((row) => ({
        gameMode: row.game_mode,
        variant: row.variant,
        games: row.games,
        players: row.players,
        avgPoints: row.avg_points,
        avgStreak: row.avg_streak,
        maxStreak: row.max_streak,
        avgPp: row.avg_pp,
        avgRounds: row.avg_rounds,
        accuracy: ratio(row.correct, row.rounds),
        skipRate: ratio(row.skips, row.rounds),
        timeoutRate: ratio(row.timeouts, row.rounds),
        quitRate: row.quits / row.games,
        failRate: row.fails / row.games,
        exhaustedRate: row.exhausted / row.games,
    }));
}

export interface HeatmapCell {
    weekday: number;
    hour: number;
    games: number;
}

function getActivityHeatmap(since: Date): Promise<HeatmapCell[]> {
    return query<HeatmapCell>("SELECT WEEKDAY(ended_at) AS weekday, HOUR(ended_at) AS hour, COUNT(*) AS games FROM games WHERE ended_at >= ? GROUP BY weekday, hour", [since]);
}

export interface RunTypeRow {
    runType: string;
    ranked: boolean;
    games: number;
    players: number;
}

async function getRunTypes(since: Date): Promise<RunTypeRow[]> {
    const rows = await query<{ run_type: string; ranked: number; games: number; players: number }>(
        "SELECT run_type, ranked, COUNT(*) AS games, COUNT(DISTINCT user_id) AS players FROM games WHERE ended_at >= ? GROUP BY run_type, ranked ORDER BY games DESC",
        [since],
    );
    return rows.map((row) => ({ runType: row.run_type, ranked: Boolean(row.ranked), games: row.games, players: row.players }));
}

export interface VersionRow {
    gameMode: AnalyticsGameMode;
    variant: string;
    rulesetVersion: number;
    ppVersion: number;
    games: number;
    firstPlayed: Date;
    avgPp: number;
    avgStreak: number;
    accuracy: number | null;
    quitRate: number;
}

async function getVersions(since: Date): Promise<VersionRow[]> {
    const rows = await query<{
        game_mode: AnalyticsGameMode;
        variant: string;
        ruleset_version: number;
        pp_version: number;
        games: number;
        first_played: Date;
        avg_pp: number;
        avg_streak: number;
        rounds: number;
        correct: number;
        quits: number;
    }>(
        `SELECT game_mode, variant, ruleset_version, pp_version, COUNT(*) AS games, MIN(ended_at) AS first_played,
            AVG(pp) AS avg_pp, AVG(streak) AS avg_streak,
            SUM(rounds_played) AS rounds, SUM(IF(rounds_played > 0, correct_count, 0)) AS correct, SUM(end_reason = 'quit') AS quits
         FROM games WHERE ended_at >= ?
         GROUP BY game_mode, variant, ruleset_version, pp_version
         ORDER BY game_mode, variant, ruleset_version, pp_version`,
        [since],
    );
    return rows.map((row) => ({
        gameMode: row.game_mode,
        variant: row.variant,
        rulesetVersion: row.ruleset_version,
        ppVersion: row.pp_version,
        games: row.games,
        firstPlayed: row.first_played,
        avgPp: row.avg_pp,
        avgStreak: row.avg_streak,
        accuracy: ratio(row.correct, row.rounds),
        quitRate: row.quits / row.games,
    }));
}

// Runs

export interface Bin {
    label: string;
    count: number;
}

export interface GroupedBins {
    group: string;
    bins: Bin[];
}

function groupBins<T extends { grp: string; bin: number; n: number }>(rows: T[], labels: string[]): GroupedBins[] {
    const groups = new Map<string, number[]>();
    for (const row of rows) {
        const counts = groups.get(row.grp) ?? labels.map(() => 0);
        counts[row.bin] = row.n;
        groups.set(row.grp, counts);
    }
    return [...groups.entries()].map(([group, counts]) => ({ group, bins: labels.map((label, index) => ({ label, count: counts[index] })) }));
}

const STREAK_BIN_LABELS = ["0", "1–4", "5–9", "10–19", "20–49", "50–99", "100+"];
const STREAK_BIN_SQL = (column: string) =>
    `CASE WHEN ${column} = 0 THEN 0 WHEN ${column} < 5 THEN 1 WHEN ${column} < 10 THEN 2 WHEN ${column} < 20 THEN 3 WHEN ${column} < 50 THEN 4 WHEN ${column} < 100 THEN 5 ELSE 6 END`;

async function getStreakDistribution(since: Date): Promise<GroupedBins[]> {
    const rows = await query<{ grp: string; bin: number; n: number }>(
        `SELECT variant AS grp, ${STREAK_BIN_SQL("streak")} AS bin, COUNT(*) AS n FROM games
         WHERE ended_at >= ? AND variant IN ('survival', 'death') GROUP BY grp, bin`,
        [since],
    );
    return groupBins(rows, STREAK_BIN_LABELS);
}

const ROUNDS_BIN_LABELS = ["1", "2–4", "5–9", "10–19", "20–29", "30–49", "50+"];

async function getRunLengthByEndReason(since: Date): Promise<GroupedBins[]> {
    const rows = await query<{ grp: string; bin: number; n: number }>(
        `SELECT end_reason AS grp,
            CASE WHEN rounds_played = 1 THEN 0 WHEN rounds_played < 5 THEN 1 WHEN rounds_played < 10 THEN 2 WHEN rounds_played < 20 THEN 3
                 WHEN rounds_played < 30 THEN 4 WHEN rounds_played < 50 THEN 5 ELSE 6 END AS bin,
            COUNT(*) AS n
         FROM games WHERE ended_at >= ? AND rounds_played > 0 GROUP BY grp, bin`,
        [since],
    );
    return groupBins(rows, ROUNDS_BIN_LABELS);
}

const DURATION_BIN_LABELS = ["< 1 min", "1–2 min", "2–5 min", "5–10 min", "10–20 min", "20–40 min", "40+ min"];

async function getSessionLengths(since: Date): Promise<Bin[]> {
    const rows = await query<{ grp: string; bin: number; n: number }>(
        `SELECT 'all' AS grp,
            CASE WHEN s < 60 THEN 0 WHEN s < 120 THEN 1 WHEN s < 300 THEN 2 WHEN s < 600 THEN 3 WHEN s < 1200 THEN 4 WHEN s < 2400 THEN 5 ELSE 6 END AS bin,
            COUNT(*) AS n
         FROM (SELECT TIMESTAMPDIFF(SECOND, started_at, ended_at) AS s FROM games WHERE ended_at >= ? AND ended_at > started_at) t
         GROUP BY bin`,
        [since],
    );
    return groupBins(rows, DURATION_BIN_LABELS)[0]?.bins ?? DURATION_BIN_LABELS.map((label) => ({ label, count: 0 }));
}

// Rounds

export interface RoundCurvePoint {
    label: string;
    rounds: number;
    accuracy: number | null;
    avgResponseMs: number | null;
    skipRate: number | null;
    timeoutRate: number | null;
}

type RoundAggregate = { bin: number; n: number; correct: number; avg_ms: number | null; skips: number; timeouts: number };

const ROUND_AGGREGATES = `COUNT(*) AS n, SUM(r.correct) AS correct, AVG(r.response_time_ms) AS avg_ms,
    SUM(r.result_type = 'skip') AS skips, SUM(r.result_type = 'timeout') AS timeouts`;

function toCurve(rows: RoundAggregate[], labels: string[]): RoundCurvePoint[] {
    const byBin = new Map(rows.map((row) => [row.bin, row]));
    return labels.map((label, index) => {
        const row = byBin.get(index);
        return {
            label,
            rounds: row?.n ?? 0,
            accuracy: row ? ratio(row.correct, row.n) : null,
            avgResponseMs: row?.avg_ms ?? null,
            skipRate: row ? ratio(row.skips, row.n) : null,
            timeoutRate: row ? ratio(row.timeouts, row.n) : null,
        };
    });
}

const MAX_ROUND_NUMBER = 30;

async function getFatigueCurve(since: Date): Promise<RoundCurvePoint[]> {
    const rows = await query<RoundAggregate>(
        `SELECT LEAST(r.round_number, ${MAX_ROUND_NUMBER + 1}) - 1 AS bin, ${ROUND_AGGREGATES}
         FROM game_rounds r JOIN games g ON g.id = r.game_id WHERE g.ended_at >= ? GROUP BY bin`,
        [since],
    );
    const labels = Array.from({ length: MAX_ROUND_NUMBER + 1 }, (_, index) => (index === MAX_ROUND_NUMBER ? `${MAX_ROUND_NUMBER + 1}+` : String(index + 1)));
    return toCurve(rows, labels);
}

async function getPressureCurve(since: Date): Promise<RoundCurvePoint[]> {
    const rows = await query<RoundAggregate>(
        `SELECT ${STREAK_BIN_SQL("r.streak_before")} AS bin, ${ROUND_AGGREGATES}
         FROM game_rounds r JOIN games g ON g.id = r.game_id WHERE g.ended_at >= ? GROUP BY bin`,
        [since],
    );
    return toCurve(rows, STREAK_BIN_LABELS);
}

export interface ResultMixRow {
    gameMode: AnalyticsGameMode;
    correct: number;
    wrong: number;
    skipped: number;
    timedOut: number;
}

async function getResultMix(since: Date): Promise<ResultMixRow[]> {
    const rows = await query<{ game_mode: AnalyticsGameMode; correct: number; wrong: number; skipped: number; timed_out: number }>(
        `SELECT g.game_mode, SUM(r.correct) AS correct, SUM(r.result_type = 'guess' AND NOT r.correct) AS wrong,
            SUM(r.result_type = 'skip') AS skipped, SUM(r.result_type = 'timeout') AS timed_out
         FROM game_rounds r JOIN games g ON g.id = r.game_id WHERE g.ended_at >= ? GROUP BY g.game_mode`,
        [since],
    );
    return rows.map((row) => ({ gameMode: row.game_mode, correct: row.correct, wrong: row.wrong, skipped: row.skipped, timedOut: row.timed_out }));
}

export interface TimerUsageBin {
    label: string;
    correct: number;
    wrong: number;
    skipped: number;
}

async function getTimerUsage(since: Date): Promise<TimerUsageBin[]> {
    const rows = await query<{ bin: number; correct: number; wrong: number; skipped: number }>(
        `SELECT FLOOR(LEAST(r.response_time_ms / r.time_limit_ms, 0.999) * 10) AS bin,
            SUM(r.correct) AS correct, SUM(r.result_type = 'guess' AND NOT r.correct) AS wrong, SUM(r.result_type = 'skip') AS skipped
         FROM game_rounds r JOIN games g ON g.id = r.game_id
         WHERE g.ended_at >= ? AND r.time_limit_ms > 0 AND r.result_type <> 'timeout'
         GROUP BY bin`,
        [since],
    );
    const byBin = new Map(rows.map((row) => [row.bin, row]));
    return Array.from({ length: 10 }, (_, index) => {
        const row = byBin.get(index);
        return { label: `${index * 10}–${index * 10 + 10}%`, correct: row?.correct ?? 0, wrong: row?.wrong ?? 0, skipped: row?.skipped ?? 0 };
    });
}

export interface CalibrationBin {
    minDifficulty: number;
    maxDifficulty: number;
    rounds: number;
    accuracy: number | null;
    avgResponseMs: number | null;
}

async function getDifficultyCalibration(since: Date): Promise<CalibrationBin[]> {
    const rows = await query<{ min_d: number; max_d: number; n: number; correct: number; avg_ms: number }>(
        `SELECT MIN(d) AS min_d, MAX(d) AS max_d, COUNT(*) AS n, SUM(correct) AS correct, AVG(response_time_ms) AS avg_ms
         FROM (SELECT r.difficulty_snapshot AS d, r.correct, r.response_time_ms, NTILE(10) OVER (ORDER BY r.difficulty_snapshot) AS tile
               FROM game_rounds r JOIN games g ON g.id = r.game_id
               WHERE g.ended_at >= ? AND r.difficulty_snapshot IS NOT NULL AND r.item_type <> 'score_pair') t
         GROUP BY tile ORDER BY tile`,
        [since],
    );
    return rows.map((row) => ({ minDifficulty: row.min_d, maxDifficulty: row.max_d, rounds: row.n, accuracy: ratio(row.correct, row.n), avgResponseMs: row.avg_ms }));
}

// Content

export interface ItemStat {
    gameMode: AnalyticsGameMode;
    itemType: string;
    itemId: number;
    answer: string;
    appearances: number;
    accuracy: number;
    skipRate: number;
    timeoutRate: number;
    avgResponseMs: number;
    avgSkipMs: number | null;
    difficulty: number | null;
}

async function getItemStats(since: Date): Promise<ItemStat[]> {
    const rows = await query<{
        game_mode: AnalyticsGameMode;
        item_type: string;
        item_id: number;
        answer: string;
        n: number;
        correct: number;
        skips: number;
        timeouts: number;
        avg_ms: number;
        avg_skip_ms: number | null;
        difficulty: number | null;
    }>(
        `SELECT g.game_mode, r.item_type, r.item_id, MAX(r.answer_snapshot) AS answer, COUNT(*) AS n, SUM(r.correct) AS correct,
            SUM(r.result_type = 'skip') AS skips, SUM(r.result_type = 'timeout') AS timeouts, AVG(r.response_time_ms) AS avg_ms,
            AVG(IF(r.result_type = 'skip', r.response_time_ms, NULL)) AS avg_skip_ms, AVG(r.difficulty_snapshot) AS difficulty
         FROM game_rounds r JOIN games g ON g.id = r.game_id
         WHERE g.ended_at >= ? AND r.item_type <> 'score_pair'
         GROUP BY g.game_mode, r.item_type, r.item_id HAVING n >= ?`,
        [since, MIN_ITEM_APPEARANCES],
    );
    return rows.map((row) => ({
        gameMode: row.game_mode,
        itemType: row.item_type,
        itemId: row.item_id,
        answer: row.answer,
        appearances: row.n,
        accuracy: row.correct / row.n,
        skipRate: row.skips / row.n,
        timeoutRate: row.timeouts / row.n,
        avgResponseMs: row.avg_ms,
        avgSkipMs: row.avg_skip_ms,
        difficulty: row.difficulty,
    }));
}

export interface WrongGuess {
    gameMode: AnalyticsGameMode;
    itemType: string;
    itemId: number;
    answer: string;
    guess: string;
    count: number;
    kind: WrongGuessKind;
}

export interface WrongGuessSummary {
    total: number;
    byKind: Record<WrongGuessKind, number>;
    nearMisses: WrongGuess[];
    artistConfusions: WrongGuess[];
    common: WrongGuess[];
}

async function getWrongGuesses(since: Date): Promise<WrongGuessSummary> {
    const rows = await query<{ game_mode: AnalyticsGameMode; item_type: string; item_id: number; answer: string; guess: string; artist: string | null; n: number }>(
        `SELECT g.game_mode, r.item_type, r.item_id, r.answer_snapshot AS answer, LOWER(TRIM(r.submitted_guess)) AS guess,
            JSON_VALUE(r.content_snapshot, '$.artist') AS artist, COUNT(*) AS n
         FROM game_rounds r JOIN games g ON g.id = r.game_id
         WHERE g.ended_at >= ? AND r.result_type = 'guess' AND NOT r.correct AND r.item_type <> 'score_pair' AND TRIM(r.submitted_guess) <> ''
         GROUP BY g.game_mode, r.item_type, r.item_id, answer, guess, artist
         ORDER BY n DESC LIMIT 5000`,
        [since],
    );

    const guesses: WrongGuess[] = rows.map((row) => ({
        gameMode: row.game_mode,
        itemType: row.item_type,
        itemId: row.item_id,
        answer: row.answer,
        guess: row.guess,
        count: row.n,
        kind: classifyWrongGuess(row.guess, row.answer, row.artist),
    }));

    const byKind: Record<WrongGuessKind, number> = { near_miss: 0, artist: 0, other: 0 };
    for (const guess of guesses) byKind[guess.kind] += guess.count;

    return {
        total: byKind.near_miss + byKind.artist + byKind.other,
        byKind,
        nearMisses: guesses.filter((guess) => guess.kind === "near_miss").slice(0, 25),
        artistConfusions: guesses.filter((guess) => guess.kind === "artist").slice(0, 15),
        common: guesses.filter((guess) => guess.kind === "other").slice(0, 25),
    };
}

export interface CoverageRow {
    gameMode: AnalyticsGameMode;
    shown: number;
    pool: number;
}

async function getCoverage(since: Date): Promise<CoverageRow[]> {
    const [shown, [pools]] = await Promise.all([
        query<{ game_mode: AnalyticsGameMode; shown: number }>(
            "SELECT g.game_mode, COUNT(DISTINCT r.item_id) AS shown FROM game_rounds r JOIN games g ON g.id = r.game_id WHERE g.ended_at >= ? GROUP BY g.game_mode",
            [since],
        ),
        query<{ mapsets: number; skins: number; pairs: number }>(
            "SELECT (SELECT COUNT(*) FROM mapset_data) AS mapsets, (SELECT COUNT(*) FROM skins) AS skins, (SELECT COUNT(*) FROM score_pp_pairs WHERE active) AS pairs",
        ),
    ]);
    const shownByMode = new Map(shown.map((row) => [row.game_mode, row.shown]));
    const poolByMode: Record<AnalyticsGameMode, number> = { background: pools.mapsets, audio: pools.mapsets, skin: pools.skins, score_pp: pools.pairs };
    return GAME_MODES.map((gameMode) => ({ gameMode, shown: shownByMode.get(gameMode) ?? 0, pool: poolByMode[gameMode] }));
}

export interface EraRow {
    year: number;
    rounds: number;
    accuracy: number;
    skipRate: number;
}

async function getAccuracyByRankedYear(since: Date): Promise<EraRow[]> {
    const rows = await query<{ year: number; n: number; correct: number; skips: number }>(
        `SELECT YEAR(JSON_VALUE(r.content_snapshot, '$.rankedAt')) AS year, COUNT(*) AS n, SUM(r.correct) AS correct, SUM(r.result_type = 'skip') AS skips
         FROM game_rounds r JOIN games g ON g.id = r.game_id
         WHERE g.ended_at >= ? AND r.item_type = 'mapset' AND JSON_VALUE(r.content_snapshot, '$.rankedAt') IS NOT NULL
         GROUP BY year HAVING year IS NOT NULL ORDER BY year`,
        [since],
    );
    return rows.map((row) => ({ year: row.year, rounds: row.n, accuracy: row.correct / row.n, skipRate: row.skips / row.n }));
}

export interface ScorePpSourceRow {
    source: string;
    rounds: number;
    accuracy: number;
    avgResponseMs: number;
}

async function getScorePpSources(since: Date): Promise<ScorePpSourceRow[]> {
    const rows = await query<{ source: string; n: number; correct: number; avg_ms: number }>(
        `SELECT p.source, COUNT(*) AS n, SUM(r.correct) AS correct, AVG(r.response_time_ms) AS avg_ms
         FROM game_rounds r JOIN games g ON g.id = r.game_id JOIN score_pp_pairs p ON p.id = r.item_id
         WHERE g.ended_at >= ? AND r.item_type = 'score_pair' GROUP BY p.source ORDER BY n DESC`,
        [since],
    );
    return rows.map((row) => ({ source: row.source, rounds: row.n, accuracy: row.correct / row.n, avgResponseMs: row.avg_ms }));
}

export interface ReportSummary {
    byType: Array<{ reportType: string; open: number; closed: number }>;
    topMapsets: Array<{ mapsetId: number; title: string | null; reports: number; open: number }>;
}

async function getReports(since: Date): Promise<ReportSummary> {
    const [byType, topMapsets] = await Promise.all([
        query<{ report_type: string; open: number; closed: number }>(
            `SELECT report_type, SUM(status IN ('pending', 'investigating')) AS open, SUM(status IN ('resolved', 'rejected')) AS closed
             FROM reports WHERE created_at >= ? GROUP BY report_type ORDER BY open DESC`,
            [since],
        ),
        query<{ mapset_id: number; title: string | null; reports: number; open: number }>(
            `SELECT r.mapset_id, MAX(m.title) AS title, COUNT(*) AS reports, SUM(r.status IN ('pending', 'investigating')) AS open
             FROM reports r LEFT JOIN mapset_data m ON m.mapset_id = r.mapset_id
             WHERE r.created_at >= ? GROUP BY r.mapset_id ORDER BY reports DESC LIMIT 10`,
            [since],
        ),
    ]);
    return {
        byType: byType.map((row) => ({ reportType: row.report_type, open: row.open, closed: row.closed })),
        topMapsets: topMapsets.map((row) => ({ mapsetId: row.mapset_id, title: row.title, reports: row.reports, open: row.open })),
    };
}

// Players

export interface CohortRow {
    cohort: string;
    users: number;
    played: number;
    retention: Array<{ days: number; returned: number; eligible: number }>;
}

export const RETENTION_DAYS = [1, 7, 30] as const;

async function getCohorts(since: Date): Promise<CohortRow[]> {
    const retentionSql = RETENTION_DAYS.map(
        (days) => `SUM(u.created_at <= NOW() - INTERVAL ${days} DAY) AS eligible_${days},
            SUM(u.created_at <= NOW() - INTERVAL ${days} DAY AND EXISTS (SELECT 1 FROM games g WHERE g.user_id = u.bancho_id AND g.ended_at >= u.created_at + INTERVAL ${days} DAY)) AS returned_${days}`,
    ).join(",\n");

    const rows = await query<Record<string, number> & { cohort: string; users: number; played: number }>(
        `SELECT ${bucketSql("u.created_at", "week")} AS cohort, COUNT(*) AS users,
            SUM(EXISTS (SELECT 1 FROM games g WHERE g.user_id = u.bancho_id)) AS played,
            ${retentionSql}
         FROM users u WHERE u.created_at >= ?
         GROUP BY cohort ORDER BY cohort DESC LIMIT 16`,
        [since],
    );
    return rows.map((row) => ({
        cohort: row.cohort,
        users: row.users,
        played: row.played,
        retention: RETENTION_DAYS.map((days) => ({ days, returned: row[`returned_${days}`], eligible: row[`eligible_${days}`] })),
    }));
}

export interface FirstModeRow {
    gameMode: AnalyticsGameMode;
    players: number;
    eligible: number;
    returned: number;
    avgGames: number;
}

async function getFirstModeRetention(since: Date): Promise<FirstModeRow[]> {
    const rows = await query<{ game_mode: AnalyticsGameMode; players: number; eligible: number; returned: number; avg_games: number }>(
        `SELECT f.game_mode, COUNT(*) AS players,
            SUM(f.ended_at <= NOW() - INTERVAL 7 DAY) AS eligible,
            SUM(f.ended_at <= NOW() - INTERVAL 7 DAY AND EXISTS (SELECT 1 FROM games g WHERE g.user_id = f.user_id AND g.ended_at >= f.ended_at + INTERVAL 7 DAY)) AS returned,
            AVG((SELECT COUNT(*) FROM games g WHERE g.user_id = f.user_id)) AS avg_games
         FROM games f JOIN (SELECT user_id, MIN(id) AS id FROM games GROUP BY user_id) firsts ON firsts.id = f.id
         WHERE f.ended_at >= ?
         GROUP BY f.game_mode ORDER BY players DESC`,
        [since],
    );
    return rows.map((row) => ({ gameMode: row.game_mode, players: row.players, eligible: row.eligible, returned: row.returned, avgGames: row.avg_games }));
}

export interface PlayerActivity {
    gamesPerPlayer: Bin[];
    topShare: Array<{ label: string; share: number }>;
    topPlayers: Array<{ userId: number; username: string | null; games: number; modes: number; accuracy: number | null; bestStreak: number }>;
}

const GAMES_PER_PLAYER_BINS: Array<{ label: string; max: number }> = [
    { label: "1", max: 1 },
    { label: "2–5", max: 5 },
    { label: "6–20", max: 20 },
    { label: "21–100", max: 100 },
    { label: "101–500", max: 500 },
    { label: "500+", max: Infinity },
];

async function getPlayerActivity(since: Date): Promise<PlayerActivity> {
    const [counts, topPlayers] = await Promise.all([
        query<{ n: number }>("SELECT COUNT(*) AS n FROM games WHERE ended_at >= ? GROUP BY user_id ORDER BY n DESC", [since]),
        query<{ user_id: number; username: string | null; games: number; modes: number; rounds: number; correct: number; best_streak: number }>(
            `SELECT g.user_id, MAX(u.username) AS username, COUNT(*) AS games, COUNT(DISTINCT g.game_mode) AS modes,
                SUM(g.rounds_played) AS rounds, SUM(IF(g.rounds_played > 0, g.correct_count, 0)) AS correct, MAX(g.streak) AS best_streak
             FROM games g LEFT JOIN users u ON u.bancho_id = g.user_id
             WHERE g.ended_at >= ? GROUP BY g.user_id ORDER BY games DESC LIMIT 15`,
            [since],
        ),
    ]);

    const gamesPerPlayer = GAMES_PER_PLAYER_BINS.map(({ label }) => ({ label, count: 0 }));
    for (const { n } of counts) gamesPerPlayer[GAMES_PER_PLAYER_BINS.findIndex((bin) => n <= bin.max)].count++;

    const totalGames = counts.reduce((sum, { n }) => sum + n, 0);
    const topShare = [0.01, 0.1, 0.5].map((fraction) => {
        const players = Math.max(1, Math.ceil(counts.length * fraction));
        const games = counts.slice(0, players).reduce((sum, { n }) => sum + n, 0);
        return { label: `Top ${fraction * 100}%`, share: totalGames > 0 ? games / totalGames : 0 };
    });

    return {
        gamesPerPlayer,
        topShare,
        topPlayers: topPlayers.map((row) => ({
            userId: row.user_id,
            username: row.username,
            games: row.games,
            modes: row.modes,
            accuracy: ratio(row.correct, row.rounds),
            bestStreak: row.best_streak,
        })),
    };
}

export interface ModeTransition {
    from: AnalyticsGameMode;
    to: AnalyticsGameMode;
    count: number;
}

async function getModeTransitions(since: Date): Promise<ModeTransition[]> {
    const rows = await query<{ from_mode: AnalyticsGameMode; to_mode: AnalyticsGameMode; n: number }>(
        `SELECT prev_mode AS from_mode, game_mode AS to_mode, COUNT(*) AS n
         FROM (SELECT game_mode, LAG(game_mode) OVER (PARTITION BY user_id ORDER BY ended_at, id) AS prev_mode FROM games WHERE ended_at >= ?) t
         WHERE prev_mode IS NOT NULL GROUP BY from_mode, to_mode`,
        [since],
    );
    return rows.map((row) => ({ from: row.from_mode, to: row.to_mode, count: row.n }));
}

export interface ProgressionRow {
    gameMode: AnalyticsGameMode;
    label: string;
    games: number;
    accuracy: number | null;
}

export const PROGRESSION_LABELS = ["1st", "2–5", "6–10", "11–25", "26–50", "51–100", "101+"];

/** Accuracy by how many games of that mode the player had played, across all of history. */
async function getSkillProgression(): Promise<ProgressionRow[]> {
    const rows = await query<{ game_mode: AnalyticsGameMode; bin: number; n: number; rounds: number; correct: number }>(
        `SELECT game_mode,
            CASE WHEN k = 1 THEN 0 WHEN k <= 5 THEN 1 WHEN k <= 10 THEN 2 WHEN k <= 25 THEN 3 WHEN k <= 50 THEN 4 WHEN k <= 100 THEN 5 ELSE 6 END AS bin,
            COUNT(*) AS n, SUM(rounds_played) AS rounds, SUM(correct_count) AS correct
         FROM (SELECT game_mode, rounds_played, correct_count, ROW_NUMBER() OVER (PARTITION BY user_id, game_mode ORDER BY ended_at, id) AS k FROM games) t
         WHERE rounds_played > 0 GROUP BY game_mode, bin`,
    );
    return rows.map((row) => ({ gameMode: row.game_mode, label: PROGRESSION_LABELS[row.bin], games: row.n, accuracy: ratio(row.correct, row.rounds) }));
}

// Challenges & multiplayer

export interface ChallengeRow {
    id: string;
    challengeType: string;
    dailyDate: Date | null;
    gameMode: AnalyticsGameMode;
    variant: string;
    createdAt: Date;
    plays: number;
    players: number;
    otherPlayers: number;
    completed: number;
    avgPoints: number | null;
}

async function getChallenges(since: Date): Promise<ChallengeRow[]> {
    const rows = await query<{
        id: string;
        challenge_type: string;
        daily_date: Date | null;
        game_mode: AnalyticsGameMode;
        variant: string;
        created_at: Date;
        plays: number;
        players: number;
        other_players: number;
        completed: number;
        avg_points: number | null;
    }>(
        `SELECT c.id, c.challenge_type, c.daily_date, c.game_mode, c.variant, c.created_at,
            COUNT(g.id) AS plays, COUNT(DISTINCT g.user_id) AS players,
            COUNT(DISTINCT IF(g.user_id <> c.creator_user_id, g.user_id, NULL)) AS other_players,
            COALESCE(SUM(g.end_reason = 'completed'), 0) AS completed, AVG(g.points) AS avg_points
         FROM game_challenges c LEFT JOIN games g ON g.challenge_id = c.id
         WHERE c.created_at >= ? GROUP BY c.id ORDER BY c.created_at DESC LIMIT 40`,
        [since],
    );
    return rows.map((row) => ({
        id: row.id,
        challengeType: row.challenge_type,
        dailyDate: row.daily_date,
        gameMode: row.game_mode,
        variant: row.variant,
        createdAt: row.created_at,
        plays: row.plays,
        players: row.players,
        otherPlayers: row.other_players,
        completed: row.completed,
        avgPoints: row.avg_points,
    }));
}

export interface MultiplayerSummary {
    matches: number;
    games: number;
    shareOfGames: number | null;
    avgPlayers: number | null;
    quitRate: number | null;
    playersPerMatch: Bin[];
    byMode: Array<{ gameMode: AnalyticsGameMode; matches: number; avgPlayers: number }>;
    trackedSince: Date | null;
}

async function getMultiplayer(since: Date, totalGames: number): Promise<MultiplayerSummary> {
    const [matches, [first]] = await Promise.all([
        query<{ match_id: string; game_mode: AnalyticsGameMode; players: number; quits: number }>(
            `SELECT match_id, MAX(game_mode) AS game_mode, COUNT(DISTINCT user_id) AS players, SUM(end_reason = 'quit') AS quits
             FROM (SELECT JSON_VALUE(config_snapshot, '$.multiplayer.matchId') AS match_id, game_mode, user_id, end_reason
                   FROM games WHERE ended_at >= ? AND config_snapshot IS NOT NULL) t
             WHERE match_id IS NOT NULL GROUP BY match_id`,
            [since],
        ),
        query<{ first: Date | null }>("SELECT MIN(ended_at) AS first FROM games WHERE JSON_VALUE(config_snapshot, '$.multiplayer.matchId') IS NOT NULL"),
    ]);

    const games = matches.reduce((sum, match) => sum + match.players, 0);
    const quits = matches.reduce((sum, match) => sum + match.quits, 0);
    const playersPerMatch = ["1", "2", "3", "4", "5–8", "9+"].map((label) => ({ label, count: 0 }));
    const byMode = new Map<AnalyticsGameMode, { matches: number; players: number }>();
    for (const match of matches) {
        playersPerMatch[match.players <= 4 ? match.players - 1 : match.players <= 8 ? 4 : 5].count++;
        const mode = byMode.get(match.game_mode) ?? { matches: 0, players: 0 };
        mode.matches++;
        mode.players += match.players;
        byMode.set(match.game_mode, mode);
    }

    return {
        matches: matches.length,
        games,
        shareOfGames: ratio(games, totalGames),
        avgPlayers: ratio(games, matches.length),
        quitRate: ratio(quits, games),
        playersPerMatch,
        byMode: [...byMode.entries()].map(([gameMode, mode]) => ({ gameMode, matches: mode.matches, avgPlayers: mode.players / mode.matches })),
        trackedSince: first?.first ?? null,
    };
}

// Entry point

export async function getAnalytics(range: AnalyticsRange) {
    const now = new Date();
    const [earliest] = await query<{ first: Date | null }>("SELECT MIN(ended_at) AS first FROM games");
    const resolved = resolveRange(range, now, earliest?.first ?? null);
    const { since, previousSince } = resolved;
    const until = new Date(now.getTime() + DAY_MS);

    const [kpis, previousKpis, timeline, modeVariants, heatmap, runTypes, versions] = await Promise.all([
        getKpis(since, until),
        previousSince ? getKpis(previousSince, since) : null,
        getTimeline(resolved, now),
        getModeVariants(since),
        getActivityHeatmap(since),
        getRunTypes(since),
        getVersions(since),
    ]);

    const [streaks, runLengths, sessionLengths, fatigue, pressure, resultMix, timerUsage, calibration] = await Promise.all([
        getStreakDistribution(since),
        getRunLengthByEndReason(since),
        getSessionLengths(since),
        getFatigueCurve(since),
        getPressureCurve(since),
        getResultMix(since),
        getTimerUsage(since),
        getDifficultyCalibration(since),
    ]);

    const [items, wrongGuesses, coverage, eras, scorePpSources, reports] = await Promise.all([
        getItemStats(since),
        getWrongGuesses(since),
        getCoverage(since),
        getAccuracyByRankedYear(since),
        getScorePpSources(since),
        getReports(since),
    ]);

    const [cohorts, firstModes, activity, transitions, progression, challenges, multiplayer] = await Promise.all([
        getCohorts(since),
        getFirstModeRetention(since),
        getPlayerActivity(since),
        getModeTransitions(since),
        getSkillProgression(),
        getChallenges(since),
        getMultiplayer(since, kpis.games),
    ]);

    return {
        range: resolved,
        generatedAt: now,
        overview: { kpis, previousKpis, timeline, modeVariants, heatmap, runTypes, versions },
        runs: { streaks, runLengths, sessionLengths },
        rounds: { fatigue, pressure, resultMix, timerUsage, calibration },
        content: { items, wrongGuesses, coverage, eras, scorePpSources, reports },
        players: { cohorts, firstModes, activity, transitions, progression },
        challenges,
        multiplayer,
    };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
