import { z } from "zod";
import { finishGameSession } from "@/lib/game/server";
import { GameMode, type DatabaseGameSession, type GameRoundResult, type GameVariant, type PersistedGameRound } from "@/actions/types";
import type { ScorePpPairSnapshot, ScorePpPublicPair, ScorePpPublicScore, ScorePpResolution, ScorePpRoundLoad, ScorePpRunState, ScorePpScoreSnapshot } from "@/lib/score-pp/types";
import { getBeatmapMaxCombo } from "@/lib/score-pp/beatmap-max-combo";
import { selectStoredScorePpPair } from "@/lib/score-pp/store";
import { calculateArcadeScore } from "@/lib/game/arcade-score";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";
import { MAX_ROUNDS, ROUND_TIME, SURVIVAL_LIVES } from "@/app/games/config";
import { acquireGameSessionLock, readOwnedGameSession, releaseGameSessionLock, writeGameSession } from "@/lib/game/session-storage";
import { getMultiplayerRoundState, getOrCreateMultiplayerRound, normalizeLobbyCode, readMultiplayerLobby, requireActiveMultiplayerLobby, updateMultiplayerProgress } from "@/lib/multiplayer";

const ROUND_TIME_MS = ROUND_TIME * 1000;

const exclusionsSchema = z.object({
    scoreIds: z.array(z.string().min(1).max(64)).max(20_000).default([]),
    userIds: z.array(z.number().int().positive()).max(20_000).default([]),
    beatmapIds: z.array(z.number().int().positive()).max(20_000).default([]),
});
const roundSchema = z.number().int().min(1).max(10_000);
const pairIdSchema = z.number().int().positive();
const scoreIdSchema = z.string().min(1).max(64).nullable();
const sessionIdSchema = z.string().uuid();
const variantSchema = z.enum(["classic", "survival"]);
const submissionTypeSchema = z.enum(["guess", "skip", "timeout"]);

function getRoundExclusions(run: DatabaseGameSession, requested: { scoreIds: string[]; userIds: number[]; beatmapIds: number[] }) {
    const scoreIds = new Set(requested.scoreIds);
    const userIds = new Set(requested.userIds);
    const beatmapIds = new Set(requested.beatmapIds);

    for (const round of run.round_history) {
        const snapshot = round.content_snapshot;
        if (!snapshot) continue;
        for (const side of ["left", "right"] as const) {
            const score = snapshot[side] as ScorePpScoreSnapshot | undefined;
            if (!score) continue;
            scoreIds.add(score.sourceScoreId);
            userIds.add(score.player.userId);
            beatmapIds.add(score.beatmap.beatmapId);
        }
    }

    return { scoreIds: [...scoreIds], userIds: [...userIds], beatmapIds: [...beatmapIds] };
}

async function hidePp(score: ScorePpScoreSnapshot): Promise<ScorePpPublicScore> {
    const beatmap = score.beatmap.maxCombo ? score.beatmap : { ...score.beatmap, maxCombo: await getBeatmapMaxCombo(score.beatmap.beatmapId) };

    return {
        sourceScoreId: score.sourceScoreId,
        player: score.player,
        beatmap,
        mods: score.mods,
        score: score.score,
        accuracy: score.accuracy,
        maxCombo: score.maxCombo,
        statistics: score.statistics,
        endedAt: score.endedAt,
    };
}

async function toPublicPair(pair: ScorePpPairSnapshot): Promise<ScorePpPublicPair> {
    const [left, right] = await Promise.all([hidePp(pair.left), hidePp(pair.right)]);
    return {
        id: pair.id,
        left,
        right,
    };
}

function scoreLabel(score: ScorePpScoreSnapshot): string {
    return `${score.player.username} - ${score.beatmap.artist} - ${score.beatmap.title} [${score.beatmap.difficultyName}]`.slice(0, 500);
}

async function readOwnedRun(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const run = await readOwnedGameSession<DatabaseGameSession>(sessionId, userId, "Score PP session not found or expired", (run) => run.game_mode === GameMode.ScorePp);
    await getCurrentMultiplayerLobby(run);
    return run;
}

async function getCurrentMultiplayerLobby(run: DatabaseGameSession) {
    if (run.multiplayer_lobby_id) {
        const lobby = await readMultiplayerLobby(run.multiplayer_lobby_id);
        if (!lobby || lobby.matchId !== run.multiplayer_match_id) {
            throw new Error("Game session belongs to a previous match");
        }
        return lobby;
    }
    return null;
}

async function readRun(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const run = await readOwnedRun(sessionId, userId);
    if (!run.is_active || run.end_pending) throw new Error("Score PP session not found or expired");
    return run;
}

function getRoundDeadline(run: DatabaseGameSession): number {
    return new Date(run.last_action_at).getTime() + ROUND_TIME_MS;
}

function getMistakes(run: DatabaseGameSession): number {
    return run.round_history.filter((item) => !item.correct).length;
}

async function getResolution(run: DatabaseGameSession): Promise<ScorePpResolution | null> {
    if (!run.has_guessed_current_round) return null;
    const latestRound = run.round_history.at(-1);
    if (!latestRound || latestRound.round_number !== run.current_round || latestRound.item_id !== run.current_item_id) return null;

    const pair = run.current_score_pp_pair;
    if (!pair) return null;
    const snapshot = latestRound.content_snapshot ?? {};
    const selectedScoreId = typeof snapshot.selectedScoreId === "string" ? snapshot.selectedScoreId : null;
    const higher = pair.left.pp > pair.right.pp ? pair.left : pair.right;

    return {
        correct: latestRound.correct,
        resultType: latestRound.result_type,
        selectedScoreId,
        higherScoreId: higher.sourceScoreId,
        scorePp: {
            [pair.left.sourceScoreId]: pair.left.pp,
            [pair.right.sourceScoreId]: pair.right.pp,
        },
        ppGap: pair.ppGap,
        pointsEarned: latestRound.points_earned,
        totalPoints: run.total_points,
        streak: run.current_streak,
        maxStreak: run.highest_streak,
        correctAnswers: run.correct_guesses,
        mistakes: getMistakes(run),
        responseTimeMs: latestRound.response_time_ms,
        terminal: false,
    };
}

async function toRunState(run: DatabaseGameSession): Promise<ScorePpRunState> {
    const terminal = !run.is_active && !run.end_pending;
    const saved = terminal && run.pp !== undefined;
    const pairSnapshot = run.is_active && run.current_item_id > 0 ? (run.current_score_pp_pair ?? null) : null;
    const pair = pairSnapshot ? await toPublicPair(pairSnapshot) : null;
    const resolution = run.is_active ? await getResolution(run) : null;

    return {
        active: run.is_active && !run.end_pending,
        terminal,
        saved,
        round: run.current_round,
        pair,
        deadlineAt: run.is_active && !run.has_guessed_current_round && pair ? getRoundDeadline(run) : null,
        resolution,
        points: run.total_points,
        streak: run.current_streak,
        maxStreak: run.highest_streak,
        mistakes: getMistakes(run),
        runPp: run.pp,
    };
}

async function acquireRunLock(sessionId: string): Promise<{ key: string; token: string }> {
    const lock = await acquireGameSessionLock(sessionId);
    if (!lock) throw new Error("Action in progress, please wait");
    return lock;
}

export async function startScorePpRunForUser(userId: number, variant: GameVariant, multiplayerLobbyCode?: string): Promise<string> {
    const parsedVariant = variantSchema.parse(variant);

    const lobbyCode = multiplayerLobbyCode ? normalizeLobbyCode(multiplayerLobbyCode) : undefined;
    const lobby = lobbyCode ? await requireActiveMultiplayerLobby(lobbyCode, userId, GameMode.ScorePp, parsedVariant) : null;
    const existingSessionId = lobby?.players.find((player) => player.userId === userId && !player.finished)?.scoreSessionId;
    if (existingSessionId) {
        try {
            const existingState = await getScorePpRunStateForUser(userId, existingSessionId);
            if (existingState.active) return existingSessionId;
        } catch {}
    }
    const sessionId = crypto.randomUUID();
    const startedAt = new Date(lobby?.startAt ?? Date.now()).toISOString();
    const run: DatabaseGameSession = {
        id: sessionId,
        user_id: userId,
        game_mode: GameMode.ScorePp,
        total_points: 0,
        current_streak: 0,
        highest_streak: 0,
        current_round: 1,
        current_item_id: 0,
        time_left: ROUND_TIME,
        last_action_at: startedAt,
        last_guess: null,
        last_guess_correct: null,
        last_points: null,
        correct_guesses: 0,
        total_time_used: 0,
        total_response_time_ms: 0,
        is_active: true,
        variant: parsedVariant,
        run_type: "standard",
        challenge_id: null,
        seed: null,
        config_snapshot: null,
        ranked: true,
        ruleset_version: CURRENT_RULESET_VERSION,
        pp_version: CURRENT_PP_VERSION,
        started_at: startedAt,
        round_history: [],
        title: "",
        artist: "",
        mapper: "",
        image_filename: "",
        audio_filename: "",
        has_guessed_current_round: false,
        multiplayer_lobby_id: lobbyCode ?? null,
        multiplayer_match_id: lobby?.matchId ?? null,
        score_pp_batch_id: null,
        current_score_pp_pair: null,
    };
    await writeGameSession(run);
    if (lobbyCode) {
        await updateMultiplayerProgress(lobbyCode, userId, { points: 0, round: 1, scoreSessionId: sessionId, finished: false }, lobby!.matchId).catch((error) =>
            console.error("Failed to update multiplayer progress:", error),
        );
    }
    return sessionId;
}

export async function getScorePpRoundForUser(userId: number, sessionId: string, round: number, exclusions: { scoreIds: string[]; userIds: number[]; beatmapIds: number[] }): Promise<ScorePpRoundLoad> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedRound = roundSchema.parse(round);
    const parsedExclusions = exclusionsSchema.parse(exclusions);

    const lock = await acquireRunLock(parsedSessionId);
    try {
        const run = await readRun(parsedSessionId, userId);
        const expectedRound = run.round_history.length + 1;
        if (parsedRound !== expectedRound) throw new Error("Unexpected Score PP round");
        const multiplayerLobby = await getCurrentMultiplayerLobby(run);

        if (run.multiplayer_lobby_id && run.has_guessed_current_round) {
            const multiplayerState = await getMultiplayerRoundState(run.multiplayer_lobby_id, userId, run.current_round);
            if (!multiplayerState.allReady) throw new Error("Waiting for other players");
        }

        if (!run.has_guessed_current_round && run.current_item_id > 0 && run.current_round === parsedRound) {
            const existing = run.current_score_pp_pair ?? null;
            return {
                pair: existing ? await toPublicPair(existing) : null,
                deadlineAt: existing ? getRoundDeadline(run) : null,
                terminal: false,
                saved: false,
            };
        }

        const exclusions = getRoundExclusions(run, parsedExclusions);
        const selectPair = () =>
            selectStoredScorePpPair(
                parsedRound,
                {
                    pairIds: new Set(run.round_history.map((item) => item.item_id)),
                    scoreIds: new Set(exclusions.scoreIds),
                    userIds: new Set(exclusions.userIds),
                    beatmapIds: new Set(exclusions.beatmapIds),
                },
                run.score_pp_batch_id,
            );
        const pair = run.multiplayer_lobby_id
            ? await getOrCreateMultiplayerRound<ScorePpPairSnapshot | null>(`${normalizeLobbyCode(run.multiplayer_lobby_id)}:${run.multiplayer_match_id}`, parsedRound, selectPair)
            : await selectPair();
        if (!pair) {
            if (run.variant !== "survival") {
                return { pair: null, deadlineAt: null, terminal: false, saved: false };
            }
            const runPp = await finishGameSession(parsedSessionId, userId, "content_exhausted");
            return {
                pair: null,
                deadlineAt: null,
                terminal: true,
                saved: runPp !== null,
                runPp: runPp ?? undefined,
            };
        }

        const startedAt = parsedRound === 1 && multiplayerLobby?.startAt !== null && multiplayerLobby?.startAt !== undefined ? multiplayerLobby.startAt : Date.now();
        const nextRun: DatabaseGameSession = {
            ...run,
            current_round: parsedRound,
            current_item_id: pair.id,
            time_left: ROUND_TIME,
            last_action_at: new Date(startedAt).toISOString(),
            last_guess: null,
            last_guess_correct: null,
            last_points: null,
            has_guessed_current_round: false,
            score_pp_batch_id: run.score_pp_batch_id ?? pair.batchId,
            current_score_pp_pair: pair,
        };
        await writeGameSession(nextRun);
        if (run.multiplayer_lobby_id) {
            await updateMultiplayerProgress(
                run.multiplayer_lobby_id,
                userId,
                {
                    points: nextRun.total_points,
                    round: parsedRound,
                    finished: false,
                },
                run.multiplayer_match_id ?? undefined,
            ).catch((error) => console.error("Failed to update multiplayer progress:", error));
        }
        return {
            pair: await toPublicPair(pair),
            deadlineAt: startedAt + ROUND_TIME_MS,
            terminal: false,
            saved: false,
        };
    } finally {
        await releaseGameSessionLock(lock);
    }
}

export async function getScorePpRunStateForUser(userId: number, sessionId: string): Promise<ScorePpRunState> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);

    const lock = await acquireRunLock(parsedSessionId);
    try {
        let run = await readOwnedRun(parsedSessionId, userId);
        if (run.end_pending) {
            await finishGameSession(parsedSessionId, userId, run.end_reason);
            run = await readOwnedRun(parsedSessionId, userId);
        }
        return await toRunState(run);
    } finally {
        await releaseGameSessionLock(lock);
    }
}

export async function endScorePpRunForUser(userId: number, sessionId: string): Promise<number | null> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);

    const lock = await acquireRunLock(parsedSessionId);
    try {
        const run = await readOwnedRun(parsedSessionId, userId);
        if (!run.is_active && !run.end_pending) return run.pp ?? null;
        return await finishGameSession(parsedSessionId, userId, run.end_reason ?? "quit");
    } finally {
        await releaseGameSessionLock(lock);
    }
}

export async function submitScorePpGuessForUser(
    userId: number,
    sessionId: string,
    pairId: number,
    selectedScoreId: string | null,
    submissionType: "guess" | "skip" | "timeout" = selectedScoreId === null ? "timeout" : "guess",
): Promise<ScorePpResolution> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedPairId = pairIdSchema.parse(pairId);
    const parsedSelectedScoreId = scoreIdSchema.parse(selectedScoreId);
    const parsedSubmissionType = submissionTypeSchema.parse(submissionType);
    if (parsedSubmissionType === "guess" && !parsedSelectedScoreId) throw new Error("A score choice is required");
    if (parsedSubmissionType !== "guess" && parsedSelectedScoreId) throw new Error("Skip and timeout submissions cannot include a score choice");

    const lock = await acquireRunLock(parsedSessionId);
    try {
        const run = await readRun(parsedSessionId, userId);
        if (run.has_guessed_current_round) throw new Error("Already submitted a choice for this round");
        if (run.current_item_id !== parsedPairId) throw new Error("Score pair does not belong to the current round");

        const pair = run.current_score_pp_pair;
        if (!pair || pair.id !== parsedPairId) throw new Error("Score pair is no longer available");
        if (parsedSelectedScoreId && parsedSelectedScoreId !== pair.left.sourceScoreId && parsedSelectedScoreId !== pair.right.sourceScoreId) {
            throw new Error("Selected score does not belong to this pair");
        }

        const now = Date.now();
        const elapsedMs = Math.max(0, now - new Date(run.last_action_at).getTime());
        let isSkipped = parsedSubmissionType === "skip";
        const isTimeout = parsedSubmissionType === "timeout";
        if (elapsedMs >= ROUND_TIME_MS + 1000 && !isSkipped) isSkipped = true;
        const resultType: GameRoundResult = isTimeout ? "timeout" : isSkipped ? "skip" : "guess";
        const selectedScoreId = resultType === "guess" ? parsedSelectedScoreId : null;
        const responseTimeMs = Math.min(elapsedMs, ROUND_TIME_MS);
        const timeLeft = Math.max(0, ROUND_TIME - Math.floor(elapsedMs / 1000));
        const higher = pair.left.pp > pair.right.pp ? pair.left : pair.right;
        const selected = selectedScoreId === pair.left.sourceScoreId ? pair.left : selectedScoreId === pair.right.sourceScoreId ? pair.right : null;
        const correct = resultType === "guess" && selectedScoreId === higher.sourceScoreId;
        const pointsEarned = calculateArcadeScore(correct, timeLeft, run.current_streak);
        const nextStreak = correct ? run.current_streak + 1 : 0;
        const mistakes = getMistakes(run) + (correct ? 0 : 1);

        const roundRecord: PersistedGameRound = {
            round_number: run.current_round,
            item_type: "score_pair",
            item_id: pair.id,
            submitted_guess: resultType === "guess" && selected ? scoreLabel(selected) : null,
            answer_snapshot: scoreLabel(higher),
            result_type: resultType,
            correct,
            response_time_ms: responseTimeMs,
            time_limit_ms: ROUND_TIME_MS,
            points_earned: pointsEarned,
            streak_before: run.current_streak,
            streak_after: nextStreak,
            difficulty_snapshot: null,
            content_snapshot: {
                pairId: pair.id,
                left: pair.left,
                right: pair.right,
                selectedScoreId,
                higherScoreId: higher.sourceScoreId,
            },
        };

        const nextRun: DatabaseGameSession = {
            ...run,
            total_points: run.total_points + pointsEarned,
            current_streak: nextStreak,
            highest_streak: Math.max(run.highest_streak, nextStreak),
            time_left: timeLeft,
            last_action_at: new Date(now).toISOString(),
            last_guess: resultType === "timeout" ? "TIMEOUT" : resultType === "skip" ? "SKIPPED" : selectedScoreId,
            last_guess_correct: correct ? 1 : 0,
            last_points: pointsEarned,
            correct_guesses: run.correct_guesses + (correct ? 1 : 0),
            total_time_used: run.total_time_used + responseTimeMs / 1000,
            total_response_time_ms: run.total_response_time_ms + responseTimeMs,
            round_history: [...run.round_history, roundRecord],
            has_guessed_current_round: true,
        };
        const terminal = (run.variant === "classic" && run.current_round >= MAX_ROUNDS) || (run.variant === "survival" && mistakes >= SURVIVAL_LIVES);
        await writeGameSession(nextRun);
        if (run.multiplayer_lobby_id) {
            await updateMultiplayerProgress(
                run.multiplayer_lobby_id,
                userId,
                {
                    points: nextRun.total_points,
                    round: nextRun.current_round,
                    submittedRound: nextRun.current_round,
                    resultRound: nextRun.current_round,
                    resultCorrect: correct,
                    resultSkipped: resultType === "skip",
                    resultPoints: pointsEarned,
                    finished: terminal,
                },
                run.multiplayer_match_id ?? undefined,
            ).catch((error) => console.error("Failed to update multiplayer progress:", error));
        }

        const runPp = terminal ? await finishGameSession(parsedSessionId, userId, run.variant === "survival" ? "failed" : undefined) : null;

        return {
            correct,
            resultType,
            selectedScoreId,
            higherScoreId: higher.sourceScoreId,
            scorePp: {
                [pair.left.sourceScoreId]: pair.left.pp,
                [pair.right.sourceScoreId]: pair.right.pp,
            },
            ppGap: pair.ppGap,
            pointsEarned,
            totalPoints: nextRun.total_points,
            streak: nextStreak,
            maxStreak: nextRun.highest_streak,
            correctAnswers: nextRun.correct_guesses,
            mistakes,
            responseTimeMs,
            terminal,
            runPp: runPp ?? undefined,
        };
    } finally {
        await releaseGameSessionLock(lock);
    }
}
