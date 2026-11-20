import "server-only";

import { prisma } from "@/lib/database/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { classifyWrongGuess, type WrongGuessKind } from "./guesses";
import { bucketKey, listBuckets, resolveRange, type AnalyticsSelection, type ResolvedRange } from "./range";

export const GAME_MODES = ["background", "audio", "skin", "score_pp"] as const;
export type AnalyticsGameMode = (typeof GAME_MODES)[number];

const MIN_ITEM_APPEARANCES = 3;
const DAY_MS = 86_400_000;
const PAGE_SIZE = 2000;

export interface Kpis {
    games: number;
    players: number;
    newUsers: number;
    rounds: number;
    accuracy: number | null;
    avgDurationSeconds: number | null;
    quitRate: number | null;
}

export interface TimelinePoint {
    bucket: string;
    games: Record<AnalyticsGameMode, number>;
    players: number;
    signups: number;
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

export interface HeatmapCell {
    weekday: number;
    hour: number;
    games: number;
}

export interface RunTypeRow {
    runType: string;
    ranked: boolean;
    games: number;
    players: number;
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

export interface Bin {
    label: string;
    count: number;
}

export interface GroupedBins {
    group: string;
    bins: Bin[];
}

export interface RoundCurvePoint {
    label: string;
    rounds: number;
    accuracy: number | null;
    avgResponseMs: number | null;
    skipRate: number | null;
    timeoutRate: number | null;
}

export interface ResultMixRow {
    gameMode: AnalyticsGameMode;
    correct: number;
    wrong: number;
    skipped: number;
    timedOut: number;
}

export interface TimerUsageBin {
    label: string;
    correct: number;
    wrong: number;
    skipped: number;
}

export interface CalibrationBin {
    minDifficulty: number;
    maxDifficulty: number;
    rounds: number;
    accuracy: number | null;
    avgResponseMs: number | null;
}

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

export interface CoverageRow {
    gameMode: AnalyticsGameMode;
    shown: number;
    pool: number;
}

export interface EraRow {
    year: number;
    rounds: number;
    accuracy: number;
    skipRate: number;
}

export interface ScorePpSourceRow {
    source: string;
    rounds: number;
    accuracy: number;
    avgResponseMs: number;
}

export interface ReportSummary {
    byType: Array<{ reportType: string; open: number; closed: number }>;
    topMapsets: Array<{ mapsetId: number; title: string | null; reports: number; open: number }>;
}

export interface CohortRow {
    cohort: string;
    users: number;
    played: number;
    retention: Array<{ days: number; returned: number; eligible: number }>;
}

export interface FirstModeRow {
    gameMode: AnalyticsGameMode;
    players: number;
    eligible: number;
    returned: number;
    avgGames: number;
}

export interface PlayerActivity {
    gamesPerPlayer: Bin[];
    topShare: Array<{ label: string; share: number }>;
    topPlayers: Array<{ userId: number; username: string | null; games: number; modes: number; accuracy: number | null; bestStreak: number }>;
}

export interface ModeTransition {
    from: AnalyticsGameMode;
    to: AnalyticsGameMode;
    count: number;
}

export interface ProgressionRow {
    gameMode: AnalyticsGameMode;
    label: string;
    games: number;
    accuracy: number | null;
}

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

export const RETENTION_DAYS = [1, 7, 30] as const;
export const PROGRESSION_LABELS = ["1st", "2–5", "6–10", "11–25", "26–50", "51–100", "101+"];

function ratio(part: number, whole: number): number | null {
    return whole > 0 ? part / whole : null;
}

function getGroup<K, V>(groups: Map<K, V>, key: K, create: () => V): V {
    const existing = groups.get(key);
    if (existing !== undefined) return existing;
    const group = create();
    groups.set(key, group);
    return group;
}

function bins(labels: string[]): Bin[] {
    return labels.map((label) => ({ label, count: 0 }));
}

function binIndex(value: number, thresholds: number[]): number {
    const index = thresholds.findIndex((threshold) => value < threshold);
    return index < 0 ? thresholds.length : index;
}

const STREAK_BIN_LABELS = ["0", "1–4", "5–9", "10–19", "20–49", "50–99", "100+"];
const STREAK_THRESHOLDS = [1, 5, 10, 20, 50, 100];
const ROUNDS_BIN_LABELS = ["1", "2–4", "5–9", "10–19", "20–29", "30–49", "50+"];
const DURATION_BIN_LABELS = ["< 1 min", "1–2 min", "2–5 min", "5–10 min", "10–20 min", "20–40 min", "40+ min"];

const gameSelect = {
    id: true, userId: true, gameMode: true, variant: true, runType: true, ranked: true,
    rulesetVersion: true, ppVersion: true, points: true, streak: true, pp: true, roundsPlayed: true,
    correctCount: true, skipCount: true, timeoutCount: true, startedAt: true, endedAt: true,
    endReason: true, configSnapshot: true,
} satisfies Prisma.GameSelect;
type AnalyticsGame = Prisma.GameGetPayload<{ select: typeof gameSelect }>;

function jsonProperty(value: Prisma.JsonValue, key: string): Prisma.JsonValue {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value[key] ?? null) : null;
}

function gameTotals() {
    return {
        games: 0, players: new Set<number>(), points: 0, streak: 0, maxStreak: 0, pp: 0, played: 0,
        rounds: 0, correct: 0, skips: 0, timeouts: 0, quits: 0, fails: 0, exhausted: 0, duration: 0, timed: 0,
    };
}

function addGame(totals: ReturnType<typeof gameTotals>, game: AnalyticsGame, duration: number) {
    totals.games++;
    totals.players.add(game.userId);
    totals.points += game.points;
    totals.streak += game.streak;
    totals.maxStreak = Math.max(totals.maxStreak, game.streak);
    totals.pp += Number(game.pp);
    totals.quits += Number(game.endReason === "quit");
    totals.fails += Number(game.endReason === "failed");
    totals.exhausted += Number(game.endReason === "content_exhausted");
    totals.skips += game.skipCount;
    totals.timeouts += game.timeoutCount;
    if (game.roundsPlayed > 0) {
        totals.played++;
        totals.rounds += game.roundsPlayed;
        totals.correct += game.correctCount;
    }
    if (duration > 0) {
        totals.duration += Math.floor(duration / 1000);
        totals.timed++;
    }
}

function toKpis(totals: ReturnType<typeof gameTotals>, newUsers: number): Kpis {
    return {
        games: totals.games, players: totals.players.size, newUsers, rounds: totals.rounds,
        accuracy: ratio(totals.correct, totals.rounds), avgDurationSeconds: ratio(totals.duration, totals.timed),
        quitRate: ratio(totals.quits, totals.games),
    };
}

async function summarizeGames({ since, until, previousSince, bucket }: ResolvedRange, now: Date) {
    const current = gameTotals();
    const previous = gameTotals();
    const lastDay = new Date(Math.min(until.getTime() - 1, now.getTime()));
    const days = new Map(listBuckets(since, lastDay, bucket).map((day) => [day, {
        bucket: day, games: { background: 0, audio: 0, skin: 0, score_pp: 0 }, players: new Set<number>(), signups: 0,
    }]));
    const modes = new Map<string, { gameMode: AnalyticsGameMode; variant: string; totals: ReturnType<typeof gameTotals> }>();
    const runGroups = new Map<string, { runType: string; ranked: boolean; games: number; players: Set<number> }>();
    const versionGroups = new Map<string, Pick<VersionRow, "gameMode" | "variant" | "rulesetVersion" | "ppVersion" | "firstPlayed"> & { totals: ReturnType<typeof gameTotals> }>();
    const heatmap = new Map<number, HeatmapCell>();
    const streakGroups = new Map<string, Bin[]>();
    const lengthGroups = new Map<string, Bin[]>();
    const sessionLengths = bins(DURATION_BIN_LABELS);
    const history = new Map<number, { first: { id: bigint; gameMode: AnalyticsGameMode; endedAt: Date }; last: Date; games: number; modeCounts: Record<AnalyticsGameMode, number> }>();
    const activityGroups = new Map<number, { games: number; modes: Set<AnalyticsGameMode>; rounds: number; correct: number; bestStreak: number; lastMode: AnalyticsGameMode | null }>();
    const transitions = new Map<string, ModeTransition>();
    const progressionGroups = new Map<string, { gameMode: AnalyticsGameMode; index: number; games: number; rounds: number; correct: number }>();
    const matches = new Map<string, { gameMode: AnalyticsGameMode; players: Set<number>; quits: number }>();
    let trackedSince: Date | null = null;

    let cursor: bigint | undefined;
    do {
        const page = await prisma.game.findMany({
            select: gameSelect,
            orderBy: [{ endedAt: "asc" }, { id: "asc" }],
            take: PAGE_SIZE,
            ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        });
        for (const game of page) {
            const { id, userId, gameMode, variant, runType, ranked, rulesetVersion, ppVersion, endedAt, endReason, roundsPlayed, correctCount } = game;
            const player = getGroup(history, userId, () => ({
                first: { id, gameMode, endedAt }, last: endedAt, games: 0, modeCounts: { background: 0, audio: 0, skin: 0, score_pp: 0 },
            }));
            if (id < player.first.id) player.first = { id, gameMode, endedAt };
            player.last = endedAt;
            player.games++;
            const gameNumber = ++player.modeCounts[gameMode];
            if (roundsPlayed > 0) {
                const index = binIndex(gameNumber, [2, 6, 11, 26, 51, 101]);
                const group = getGroup(progressionGroups, `${gameMode}:${index}`, () => ({ gameMode, index, games: 0, rounds: 0, correct: 0 }));
                group.games++;
                group.rounds += roundsPlayed;
                group.correct += correctCount;
            }

            const matchId = jsonProperty(jsonProperty(game.configSnapshot, "multiplayer"), "matchId");
            if (typeof matchId === "string") trackedSince ??= endedAt;
            const duration = endedAt.getTime() - game.startedAt.getTime();
            if (endedAt < since) {
                if (previousSince && endedAt >= previousSince) addGame(previous, game, duration);
                continue;
            }

            // Later games still count toward each player's history above, which retention needs.
            if (endedAt >= until) continue;
            addGame(current, game, duration);
            const day = days.get(bucketKey(endedAt, bucket));
            if (day) {
                day.games[gameMode]++;
                day.players.add(userId);
            }
            const mode = getGroup(modes, `${gameMode}:${variant}`, () => ({ gameMode, variant, totals: gameTotals() }));
            addGame(mode.totals, game, duration);
            const version = getGroup(versionGroups, `${gameMode}:${variant}:${rulesetVersion}:${ppVersion}`, () => ({
                gameMode, variant, rulesetVersion, ppVersion, firstPlayed: endedAt, totals: gameTotals(),
            }));
            addGame(version.totals, game, duration);
            const run = getGroup(runGroups, `${runType}:${ranked}`, () => ({ runType, ranked, games: 0, players: new Set<number>() }));
            run.games++;
            run.players.add(userId);
            const weekday = (endedAt.getUTCDay() + 6) % 7;
            const hour = endedAt.getUTCHours();
            getGroup(heatmap, weekday * 24 + hour, () => ({ weekday, hour, games: 0 })).games++;
            if (variant !== "classic") {
                getGroup(streakGroups, variant, () => bins(STREAK_BIN_LABELS))[binIndex(game.streak, STREAK_THRESHOLDS)].count++;
            }
            if (roundsPlayed > 0) {
                getGroup(lengthGroups, endReason, () => bins(ROUNDS_BIN_LABELS))[binIndex(roundsPlayed, [2, 5, 10, 20, 30, 50])].count++;
            }
            if (duration > 0) sessionLengths[binIndex(duration / 1000, [60, 120, 300, 600, 1200, 2400])].count++;

            const activity = getGroup(activityGroups, userId, () => ({
                games: 0, modes: new Set<AnalyticsGameMode>(), rounds: 0, correct: 0, bestStreak: 0, lastMode: null as AnalyticsGameMode | null,
            }));
            if (activity.lastMode !== null) {
                const from = activity.lastMode;
                getGroup(transitions, `${from}:${gameMode}`, () => ({ from, to: gameMode, count: 0 })).count++;
            }
            activity.games++;
            activity.modes.add(gameMode);
            activity.rounds += roundsPlayed;
            if (roundsPlayed > 0) activity.correct += correctCount;
            activity.bestStreak = Math.max(activity.bestStreak, game.streak);
            activity.lastMode = gameMode;

            if (typeof matchId === "string") {
                const match = getGroup(matches, matchId, () => ({ gameMode, players: new Set<number>(), quits: 0 }));
                if (gameMode > match.gameMode) match.gameMode = gameMode;
                match.players.add(userId);
                match.quits += Number(endReason === "quit");
            }
        }
        cursor = page.length === PAGE_SIZE ? page[page.length - 1].id : undefined;
    } while (cursor !== undefined);

    const cohorts = new Map<string, CohortRow>();
    let newUsers = 0;
    let previousNewUsers = 0;
    let userCursor: number | undefined;
    do {
        const page = await prisma.user.findMany({
            where: { createdAt: { gte: previousSince ?? since, lt: until }, ...(userCursor === undefined ? {} : { banchoId: { gt: userCursor } }) },
            select: { banchoId: true, createdAt: true },
            orderBy: { banchoId: "asc" },
            take: PAGE_SIZE,
        });
        for (const { banchoId, createdAt } of page) {
            if (createdAt < since) {
                previousNewUsers++;
                continue;
            }
            newUsers++;
            const day = days.get(bucketKey(createdAt, bucket));
            if (day) day.signups++;
            const cohort = bucketKey(createdAt, "week");
            const group = getGroup(cohorts, cohort, () => ({
                cohort, users: 0, played: 0, retention: RETENTION_DAYS.map((days) => ({ days, returned: 0, eligible: 0 })),
            }));
            const player = history.get(banchoId);
            group.users++;
            if (player) group.played++;
            for (const retention of group.retention) {
                const returnAt = createdAt.getTime() + retention.days * DAY_MS;
                if (returnAt > now.getTime()) continue;
                retention.eligible++;
                if (player && player.last.getTime() >= returnAt) retention.returned++;
            }
        }
        userCursor = page.length === PAGE_SIZE ? page[page.length - 1].banchoId : undefined;
    } while (userCursor !== undefined);

    const firstModes = new Map<AnalyticsGameMode, FirstModeRow>();
    for (const { first, last, games } of history.values()) {
        if (first.endedAt < since || first.endedAt >= until) continue;
        const group = getGroup(firstModes, first.gameMode, () => ({ gameMode: first.gameMode, players: 0, returned: 0, eligible: 0, avgGames: 0 }));
        group.players++;
        group.avgGames += games;
        const returnAt = first.endedAt.getTime() + 7 * DAY_MS;
        if (returnAt <= now.getTime()) {
            group.eligible++;
            if (last.getTime() >= returnAt) group.returned++;
        }
    }

    return {
        overview: {
            kpis: toKpis(current, newUsers),
            previousKpis: previousSince ? toKpis(previous, previousNewUsers) : null,
            timeline: [...days.values()].map(({ players, ...day }): TimelinePoint => ({ ...day, players: players.size })),
            modeVariants: [...modes.values()].map(({ gameMode, variant, totals: t }): ModeVariantRow => ({
                gameMode, variant, games: t.games, players: t.players.size, avgPoints: t.points / t.games, avgStreak: t.streak / t.games,
                maxStreak: t.maxStreak, avgPp: t.pp / t.games, avgRounds: ratio(t.rounds, t.played), accuracy: ratio(t.correct, t.rounds),
                skipRate: ratio(t.skips, t.rounds), timeoutRate: ratio(t.timeouts, t.rounds), quitRate: t.quits / t.games,
                failRate: t.fails / t.games, exhaustedRate: t.exhausted / t.games,
            })).sort((a, b) => b.games - a.games),
            heatmap: [...heatmap.values()],
            runTypes: [...runGroups.values()].map(({ players, ...run }): RunTypeRow => ({ ...run, players: players.size })).sort((a, b) => b.games - a.games),
            versions: [...versionGroups.values()].map(({ totals: t, ...version }): VersionRow => ({
                ...version, games: t.games, avgPp: t.pp / t.games, avgStreak: t.streak / t.games,
                accuracy: ratio(t.correct, t.rounds), quitRate: t.quits / t.games,
            })).sort((a, b) => GAME_MODES.indexOf(a.gameMode) - GAME_MODES.indexOf(b.gameMode)
                || a.variant.localeCompare(b.variant) || a.rulesetVersion - b.rulesetVersion || a.ppVersion - b.ppVersion),
        },
        runs: {
            streaks: [...streakGroups].map(([group, bins]): GroupedBins => ({ group, bins })),
            runLengths: [...lengthGroups].map(([group, bins]): GroupedBins => ({ group, bins })),
            sessionLengths,
        },
        players: {
            cohorts: [...cohorts.values()].sort((a, b) => b.cohort.localeCompare(a.cohort)).slice(0, 16),
            firstModes: [...firstModes.values()].map((group) => ({ ...group, avgGames: group.avgGames / group.players })).sort((a, b) => b.players - a.players),
            activity: await summarizeActivity(activityGroups),
            transitions: [...transitions.values()],
            progression: [...progressionGroups.values()].map(({ gameMode, index, games, rounds, correct }): ProgressionRow => ({
                gameMode, label: PROGRESSION_LABELS[index], games, accuracy: ratio(correct, rounds),
            })),
        },
        multiplayer: summarizeMultiplayer(matches, current.games, trackedSince),
    };
}

async function summarizeActivity(groups: Map<number, {
    games: number; modes: Set<AnalyticsGameMode>; rounds: number; correct: number; bestStreak: number;
}>): Promise<PlayerActivity> {
    const ranking = [...groups].sort((a, b) => b[1].games - a[1].games);
    const gamesPerPlayer = bins(["1", "2–5", "6–20", "21–100", "101–500", "500+"]);
    let totalGames = 0;
    for (const [, activity] of ranking) {
        totalGames += activity.games;
        gamesPerPlayer[binIndex(activity.games, [2, 6, 21, 101, 501])].count++;
    }
    const topShare = [0.01, 0.1, 0.5].map((fraction) => {
        const players = Math.max(1, Math.ceil(ranking.length * fraction));
        const games = ranking.slice(0, players).reduce((sum, [, activity]) => sum + activity.games, 0);
        return { label: `Top ${fraction * 100}%`, share: ratio(games, totalGames) ?? 0 };
    });
    const leaders = ranking.slice(0, 15);
    const users = await prisma.user.findMany({ where: { banchoId: { in: leaders.map(([id]) => id) } }, select: { banchoId: true, username: true } });
    const names = new Map(users.map(({ banchoId, username }) => [banchoId, username]));
    return {
        gamesPerPlayer, topShare,
        topPlayers: leaders.map(([userId, player]) => ({
            userId, username: names.get(userId) ?? null, games: player.games, modes: player.modes.size,
            accuracy: ratio(player.correct, player.rounds), bestStreak: player.bestStreak,
        })),
    };
}

function summarizeMultiplayer(
    matches: Map<string, { gameMode: AnalyticsGameMode; players: Set<number>; quits: number }>,
    totalGames: number,
    trackedSince: Date | null,
): MultiplayerSummary {
    let games = 0;
    let quits = 0;
    const playersPerMatch = bins(["1", "2", "3", "4", "5–8", "9+"]);
    const byMode = new Map<AnalyticsGameMode, { matches: number; players: number }>();
    for (const { gameMode, players, quits: matchQuits } of matches.values()) {
        games += players.size;
        quits += matchQuits;
        playersPerMatch[binIndex(players.size, [2, 3, 4, 5, 9])].count++;
        const mode = getGroup(byMode, gameMode, () => ({ matches: 0, players: 0 }));
        mode.matches++;
        mode.players += players.size;
    }
    return {
        matches: matches.size, games, shareOfGames: ratio(games, totalGames), avgPlayers: ratio(games, matches.size),
        quitRate: ratio(quits, games), playersPerMatch, trackedSince,
        byMode: [...byMode].map(([gameMode, { matches, players }]) => ({ gameMode, matches, avgPlayers: players / matches })),
    };
}

function roundTotals() {
    return { rounds: 0, correct: 0, wrong: 0, skipped: 0, timedOut: 0, response: 0, skipResponse: 0 };
}

function addRound(totals: ReturnType<typeof roundTotals>, round: { correct: boolean; resultType: string; responseTimeMs: number }) {
    totals.rounds++;
    totals.correct += Number(round.correct);
    totals.wrong += Number(round.resultType === "guess" && !round.correct);
    totals.timedOut += Number(round.resultType === "timeout");
    totals.response += round.responseTimeMs;
    if (round.resultType === "skip") {
        totals.skipped++;
        totals.skipResponse += round.responseTimeMs;
    }
}

function toCurve(totals: ReturnType<typeof roundTotals>[], labels: string[]): RoundCurvePoint[] {
    return totals.map((row, index) => ({
        label: labels[index], rounds: row.rounds, accuracy: ratio(row.correct, row.rounds),
        avgResponseMs: ratio(row.response, row.rounds), skipRate: ratio(row.skipped, row.rounds),
        timeoutRate: ratio(row.timedOut, row.rounds),
    }));
}

function difficultyCalibration(samples: Array<{ difficulty: number; correct: boolean; response: number }>): CalibrationBin[] {
    samples.sort((a, b) => a.difficulty - b.difficulty);
    const baseSize = Math.floor(samples.length / 10);
    const extra = samples.length % 10;
    const result: CalibrationBin[] = [];
    let start = 0;
    for (let index = 0; index < Math.min(10, samples.length); index++) {
        const size = baseSize + Number(index < extra);
        const end = start + size;
        let correct = 0;
        let response = 0;
        for (let position = start; position < end; position++) {
            correct += Number(samples[position].correct);
            response += samples[position].response;
        }
        result.push({
            minDifficulty: samples[start].difficulty, maxDifficulty: samples[end - 1].difficulty, rounds: size,
            accuracy: correct / size, avgResponseMs: response / size,
        });
        start = end;
    }
    return result;
}

const textOrder = new Intl.Collator("und", { sensitivity: "base" });

async function summarizeRounds(since: Date, until: Date) {
    const fatigueLabels = Array.from({ length: 31 }, (_, index) => index === 30 ? "31+" : String(index + 1));
    const fatigue = fatigueLabels.map(roundTotals);
    const pressure = STREAK_BIN_LABELS.map(roundTotals);
    const results = new Map<AnalyticsGameMode, ReturnType<typeof roundTotals>>();
    const timer = Array.from({ length: 10 }, roundTotals);
    const samples: Array<{ difficulty: number; correct: boolean; response: number }> = [];
    const items = new Map<string, {
        gameMode: AnalyticsGameMode; itemType: string; itemId: number; answer: string;
        totals: ReturnType<typeof roundTotals>; difficulty: number; measured: number;
    }>();
    const misses = new Map<string, Omit<WrongGuess, "kind"> & { artist: string | null }>();
    const shown = new Map<AnalyticsGameMode, Set<number>>();
    const byYear = new Map<number, ReturnType<typeof roundTotals>>();
    const byPair = new Map<number, { rounds: number; correct: number; response: number }>();

    let after: bigint | undefined;
    do {
        const page = await prisma.gameRound.findMany({
            where: { game: { endedAt: { gte: since, lt: until } }, ...(after === undefined ? {} : { id: { gt: after } }) },
            select: {
                id: true, roundNumber: true, streakBefore: true, resultType: true, itemType: true, itemId: true,
                correct: true, responseTimeMs: true, timeLimitMs: true, difficultySnapshot: true,
                answerSnapshot: true, submittedGuess: true, contentSnapshot: true, game: { select: { gameMode: true } },
            },
            orderBy: { id: "asc" },
            take: PAGE_SIZE,
        });
        for (const round of page) {
            const { game: { gameMode }, itemType, itemId, answerSnapshot: answer, resultType, correct, responseTimeMs, timeLimitMs } = round;
            if (round.roundNumber > 0) addRound(fatigue[Math.min(round.roundNumber, 31) - 1], round);
            addRound(pressure[binIndex(round.streakBefore, STREAK_THRESHOLDS)], round);
            addRound(getGroup(results, gameMode, roundTotals), round);
            if (timeLimitMs && resultType !== "timeout") addRound(timer[Math.min(Math.floor(10 * responseTimeMs / timeLimitMs), 9)], round);
            getGroup(shown, gameMode, () => new Set<number>()).add(itemId);

            if (itemType === "score_pair") {
                const pair = getGroup(byPair, itemId, () => ({ rounds: 0, correct: 0, response: 0 }));
                pair.rounds++;
                pair.correct += Number(correct);
                pair.response += responseTimeMs;
                continue;
            }
            const item = getGroup(items, `${gameMode}:${itemType}:${itemId}`, () => ({
                gameMode, itemType, itemId, answer, totals: roundTotals(), difficulty: 0, measured: 0,
            }));
            addRound(item.totals, round);
            if (textOrder.compare(answer, item.answer) > 0) item.answer = answer;
            if (round.difficultySnapshot !== null) {
                const difficulty = Number(round.difficultySnapshot);
                item.difficulty += difficulty;
                item.measured++;
                samples.push({ difficulty, correct, response: responseTimeMs });
            }
            const guess = round.submittedGuess?.replace(/^ +| +$/g, "").toLowerCase();
            if (resultType === "guess" && !correct && guess) {
                const artist = jsonProperty(round.contentSnapshot, "artist");
                const key = JSON.stringify([gameMode, itemType, itemId, answer, guess, artist]);
                getGroup(misses, key, () => ({ gameMode, itemType, itemId, answer, guess, artist: typeof artist === "string" ? artist : null, count: 0 })).count++;
            }
            if (itemType === "mapset") {
                const rankedAt = jsonProperty(round.contentSnapshot, "rankedAt");
                if (typeof rankedAt === "string") {
                    const year = new Date(rankedAt).getUTCFullYear();
                    if (Number.isFinite(year)) addRound(getGroup(byYear, year, roundTotals), round);
                }
            }
        }
        after = page.length === PAGE_SIZE ? page[page.length - 1].id : undefined;
    } while (after !== undefined);

    const [mapsets, skins, pairs, scorePpSources] = await Promise.all([
        prisma.mapsetData.count(),
        prisma.skin.count(),
        prisma.scorePpPair.count({ where: { active: true } }),
        summarizeScorePpSources(byPair),
    ]);
    const pools = { background: mapsets, audio: mapsets, skin: skins, score_pp: pairs };
    const coverage: CoverageRow[] = GAME_MODES.map((gameMode) => ({ gameMode, shown: shown.get(gameMode)?.size ?? 0, pool: pools[gameMode] }));
    const guesses: WrongGuess[] = [...misses.values()].sort((a, b) => b.count - a.count).slice(0, 5000).map(({ artist, ...row }) => ({
        ...row, kind: classifyWrongGuess(row.guess, row.answer, artist),
    }));
    const byKind: Record<WrongGuessKind, number> = { near_miss: 0, artist: 0, other: 0 };
    for (const guess of guesses) byKind[guess.kind] += guess.count;
    const wrongGuesses: WrongGuessSummary = {
        total: byKind.near_miss + byKind.artist + byKind.other, byKind,
        nearMisses: guesses.filter(({ kind }) => kind === "near_miss").slice(0, 25),
        artistConfusions: guesses.filter(({ kind }) => kind === "artist").slice(0, 15),
        common: guesses.filter(({ kind }) => kind === "other").slice(0, 25),
    };

    return {
        rounds: {
            fatigue: toCurve(fatigue, fatigueLabels),
            pressure: toCurve(pressure, STREAK_BIN_LABELS),
            resultMix: [...results].map(([gameMode, { correct, wrong, skipped, timedOut }]): ResultMixRow => ({ gameMode, correct, wrong, skipped, timedOut })),
            timerUsage: timer.map(({ correct, wrong, skipped }, index): TimerUsageBin => ({ label: `${index * 10}–${index * 10 + 10}%`, correct, wrong, skipped })),
            calibration: difficultyCalibration(samples),
        },
        content: {
            items: [...items.values()].filter(({ totals }) => totals.rounds >= MIN_ITEM_APPEARANCES).map(({ gameMode, itemType, itemId, answer, totals: t, difficulty, measured }): ItemStat => ({
                gameMode, itemType, itemId, answer, appearances: t.rounds, accuracy: t.correct / t.rounds,
                skipRate: t.skipped / t.rounds, timeoutRate: t.timedOut / t.rounds, avgResponseMs: t.response / t.rounds,
                avgSkipMs: ratio(t.skipResponse, t.skipped), difficulty: ratio(difficulty, measured),
            })),
            wrongGuesses, coverage, scorePpSources,
            eras: [...byYear].sort(([a], [b]) => a - b).map(([year, t]): EraRow => ({
                year, rounds: t.rounds, accuracy: t.correct / t.rounds, skipRate: t.skipped / t.rounds,
            })),
        },
    };
}

async function summarizeScorePpSources(byPair: Map<number, { rounds: number; correct: number; response: number }>): Promise<ScorePpSourceRow[]> {
    const ids = [...byPair.keys()];
    const sources = new Map<string, { rounds: number; correct: number; response: number }>();
    for (let start = 0; start < ids.length; start += PAGE_SIZE) {
        const pairs = await prisma.scorePpPair.findMany({ where: { id: { in: ids.slice(start, start + PAGE_SIZE) } }, select: { id: true, source: true } });
        for (const { id, source } of pairs) {
            const pair = byPair.get(id)!;
            const total = getGroup(sources, source, () => ({ rounds: 0, correct: 0, response: 0 }));
            total.rounds += pair.rounds;
            total.correct += pair.correct;
            total.response += pair.response;
        }
    }
    return [...sources].map(([source, { rounds, correct, response }]) => ({
        source, rounds, accuracy: correct / rounds, avgResponseMs: response / rounds,
    })).sort((a, b) => b.rounds - a.rounds);
}

async function getReports(since: Date, until: Date): Promise<ReportSummary> {
    const createdAt = { gte: since, lt: until };
    const [types, leaders] = await Promise.all([
        prisma.report.groupBy({ by: ["reportType", "status"], where: { createdAt }, _count: { _all: true } }),
        prisma.report.groupBy({
            by: ["mapsetId"], where: { createdAt }, _count: { _all: true },
            orderBy: { _count: { mapsetId: "desc" } }, take: 10,
        }),
    ]);
    const byType = new Map<string, ReportSummary["byType"][number]>();
    for (const { reportType, status, _count } of types) {
        const group = getGroup(byType, reportType, () => ({ reportType, open: 0, closed: 0 }));
        if (status === "pending" || status === "investigating") group.open += _count._all;
        else group.closed += _count._all;
    }

    const mapsetId = { in: leaders.map((row) => row.mapsetId) };
    const [mapsets, open] = await Promise.all([
        prisma.mapsetData.findMany({ where: { mapsetId }, select: { mapsetId: true, title: true } }),
        prisma.report.groupBy({
            by: ["mapsetId"], where: { mapsetId, createdAt, status: { in: ["pending", "investigating"] } }, _count: { _all: true },
        }),
    ]);
    const names = new Map(mapsets.map((mapset) => [mapset.mapsetId, mapset.title]));
    const openCounts = new Map(open.map((row) => [row.mapsetId, row._count._all]));
    return {
        byType: [...byType.values()].sort((a, b) => b.open - a.open),
        topMapsets: leaders.map((row) => ({
            mapsetId: row.mapsetId, title: names.get(row.mapsetId) ?? null, reports: row._count._all, open: openCounts.get(row.mapsetId) ?? 0,
        })),
    };
}

async function getChallenges(since: Date, until: Date): Promise<ChallengeRow[]> {
    const challenges = await prisma.gameChallenge.findMany({
        where: { createdAt: { gte: since, lt: until } }, orderBy: { createdAt: "desc" }, take: 40,
        select: { id: true, challengeType: true, dailyDate: true, gameMode: true, variant: true, createdAt: true, creatorUserId: true },
    });
    const games = await prisma.game.groupBy({
        by: ["challengeId", "userId", "endReason"], where: { challengeId: { in: challenges.map(({ id }) => id) } },
        _count: { _all: true }, _sum: { points: true },
    });
    const groups = new Map<string, { players: Set<number>; plays: number; points: number; completed: number }>();
    for (const { challengeId, userId, endReason, _count, _sum } of games) {
        if (challengeId === null) continue;
        const row = getGroup(groups, challengeId, () => ({ players: new Set<number>(), plays: 0, points: 0, completed: 0 }));
        row.players.add(userId);
        row.plays += _count._all;
        row.points += _sum.points ?? 0;
        if (endReason === "completed") row.completed += _count._all;
    }
    return challenges.map(({ creatorUserId, ...challenge }) => {
        const group = groups.get(challenge.id);
        const players = group?.players.size ?? 0;
        return {
            ...challenge, plays: group?.plays ?? 0, players,
            otherPlayers: creatorUserId === null ? 0 : players - Number(group?.players.has(creatorUserId) ?? false),
            completed: group?.completed ?? 0, avgPoints: group ? ratio(group.points, group.plays) : null,
        };
    });
}

export async function getAnalytics(selection: AnalyticsSelection) {
    const now = new Date();
    const earliest = await prisma.game.findFirst({ orderBy: { endedAt: "asc" }, select: { endedAt: true } });
    const resolved = resolveRange(selection, now, earliest?.endedAt ?? null);
    const [gameData, roundData, reports, challenges] = await Promise.all([
        summarizeGames(resolved, now),
        summarizeRounds(resolved.since, resolved.until),
        getReports(resolved.since, resolved.until),
        getChallenges(resolved.since, resolved.until),
    ]);
    return {
        range: resolved,
        generatedAt: now,
        ...gameData,
        rounds: roundData.rounds,
        content: { ...roundData.content, reports },
        challenges,
    };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
