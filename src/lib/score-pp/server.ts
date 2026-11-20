import { z } from "zod";
import { finishGameSession, getRoundDifficultySnapshot } from "@/lib/game/server";
import { GameMode, type DatabaseGameSession, type GameRoundResult, type GameRunType, type GameVariant, type PersistedGameRound } from "@/actions/types";
import type { ScorePpPairSnapshot, ScorePpPublicPair, ScorePpPublicScore, ScorePpResolution, ScorePpRoundLoad, ScorePpRunEndResult, ScorePpRunState, ScorePpScoreSnapshot } from "./types";
import { getBeatmapMaxCombo } from "./beatmap-max-combo";
import { getStoredScorePpPairsByIds, selectStoredScorePpPair } from "./store";
import { calculateArcadeScore } from "@/lib/game/arcade-score";
import { catchUpDailyRounds } from "@/lib/game/daily-timing";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";
import { DAILY_ROUNDS, GAME_VARIANTS, MAX_ROUNDS, getRoundTime, getVariantLives, isContinuousVariant } from "@/app/games/config";
import { acquireGameSessionLock, deleteGameSession, readOwnedGameSession, releaseGameSessionLock, writeGameSession } from "@/lib/game/session-storage";
import { getMultiplayerRoundState, getOrCreateMultiplayerRound, normalizeLobbyCode, readMultiplayerLobby, requireActiveMultiplayerLobby, updateMultiplayerProgress } from "@/lib/multiplayer/multiplayer";
import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/infra/env";
import { DAILY_CHALLENGE_ALREADY_PLAYED, DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED, getDailyChallengeDay, getDailyDate, DAILY_ROUND_TIME } from "@/lib/game/daily";

import { Prisma } from "@/generated/prisma/client";
import { acquireRedisLock, releaseRedisLock } from "@/lib/infra/redis-lock-core";
const DAILY_SESSION_TTL_SECONDS = 24 * 60 * 60;

function writeScorePpSession(run: DatabaseGameSession): Promise<void> {
    return writeGameSession(run, run.run_type === "daily" ? DAILY_SESSION_TTL_SECONDS : undefined);
}

const exclusionsSchema = z.object({
    scoreIds: z.array(z.string().min(1).max(64)).max(20_000).default([]),
    userIds: z.array(z.number().int().positive()).max(20_000).default([]),
    beatmapIds: z.array(z.number().int().positive()).max(20_000).default([]),
});
const roundSchema = z.number().int().min(1).max(10_000);
const pairIdSchema = z.number().int().positive();
const scoreIdSchema = z.string().min(1).max(64).nullable();
const sessionIdSchema = z.string().uuid();
const variantSchema = z.enum(GAME_VARIANTS);
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
    const run = await readOwnedGameSession<DatabaseGameSession>(
        sessionId,
        userId,
        "Score PP session not found or expired",
        (run) => run.game_mode === GameMode.ScorePp && (userId !== 0 || run.run_type === "daily"),
    );
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

async function expireDailyScorePpRun(run: DatabaseGameSession, force = false): Promise<DatabaseGameSession> {
    if (run.run_type !== "daily" || !run.is_active || !run.current_score_pp_pair) return run;
    const updated = await catchUpDailyRounds(
        run,
        force,
        async (round) => {
            if (!run.challenge_id) throw new Error("Daily Score pp challenge is missing");
            const pair = await getScheduledDailyScorePpPair(run.challenge_id, round);
            return { current_item_id: pair.id, current_score_pp_pair: pair };
        },
        (state) => {
            const pair = state.current_score_pp_pair!;
            const higher = pair.left.pp > pair.right.pp ? pair.left : pair.right;
            return {
                item_type: "score_pair",
                item_id: pair.id,
                answer_snapshot: scoreLabel(higher),
                difficulty_snapshot: pair.difficultySnapshot ?? 1,
                content_snapshot: { left: pair.left, right: pair.right, higherScoreId: higher.sourceScoreId, selectedScoreId: null },
            };
        },
    );
    if (updated !== run) await writeScorePpSession(updated);
    if (updated.current_round === DAILY_ROUNDS && updated.has_guessed_current_round) {
        await finishGameSession(run.id, run.user_id, "completed");
        return readOwnedRun(run.id, run.user_id);
    }
    return updated;
}

async function readRun(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const run = await expireDailyScorePpRun(await readOwnedRun(sessionId, userId));
    if (!run.is_active || run.end_pending) throw new Error("Score PP session not found or expired");
    return run;
}

function getRoundDeadline(run: DatabaseGameSession): number {
    return new Date(run.last_action_at).getTime() + getRoundTime(run.run_type) * 1000;
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
        terminal: isTerminalRound(run),
        ...(run.pp !== undefined ? { runPp: run.pp } : {}),
    };
}

function isTerminalRound(run: DatabaseGameSession): boolean {
    const roundLimit = run.run_type === "daily" ? DAILY_ROUNDS : MAX_ROUNDS;
    return (run.variant === "classic" && run.current_round >= roundLimit) || (isContinuousVariant(run.variant) && getMistakes(run) >= getVariantLives(run.variant));
}

async function toRunState(run: DatabaseGameSession, allSubmitted = true): Promise<ScorePpRunState> {
    const withholdingCurrentRound = run.has_guessed_current_round && !allSubmitted;
    const previousRounds = withholdingCurrentRound ? run.round_history.filter((round) => round.round_number < run.current_round) : run.round_history;
    const terminal = !withholdingCurrentRound && !run.is_active && !run.end_pending;
    const saved = terminal && run.pp !== undefined;
    const pairSnapshot = run.current_item_id > 0 && (run.is_active || run.has_guessed_current_round) ? (run.current_score_pp_pair ?? null) : null;
    const pair = pairSnapshot ? await toPublicPair(pairSnapshot) : null;
    const resolution = run.has_guessed_current_round && !withholdingCurrentRound ? await getResolution(run) : null;

    return {
        active: withholdingCurrentRound || (run.is_active && !run.end_pending),
        terminal,
        saved,
        submitted: run.has_guessed_current_round,
        round: run.current_round,
        runType: run.run_type ?? "standard",
        pair,
        deadlineAt: run.is_active && !run.has_guessed_current_round && pair ? getRoundDeadline(run) : null,
        resolution,
        points: withholdingCurrentRound ? previousRounds.reduce((total, round) => total + round.points_earned, 0) : run.total_points,
        streak: withholdingCurrentRound ? (previousRounds.at(-1)?.streak_after ?? 0) : run.current_streak,
        maxStreak: withholdingCurrentRound ? Math.max(0, ...previousRounds.map((round) => round.streak_after)) : run.highest_streak,
        mistakes: withholdingCurrentRound ? previousRounds.filter((round) => !round.correct).length : getMistakes(run),
        ...(!withholdingCurrentRound && run.pp !== undefined ? { runPp: run.pp } : {}),
    };
}

async function isCurrentRoundRevealed(run: DatabaseGameSession, userId: number): Promise<boolean> {
    if (!run.multiplayer_lobby_id || !run.has_guessed_current_round) return true;
    const state = await getMultiplayerRoundState(run.multiplayer_lobby_id, userId, run.current_round);
    return state.allSubmitted;
}

async function finishTerminalMultiplayerRuns(run: DatabaseGameSession | null): Promise<void> {
    if (!run?.multiplayer_lobby_id || !run.has_guessed_current_round) return;
    try {
        const lobby = await getCurrentMultiplayerLobby(run);
        if (!lobby || !(await isCurrentRoundRevealed(run, run.user_id))) return;

        for (const player of lobby.players) {
            if (!player.scoreSessionId) continue;
            const lock = await acquireGameSessionLock(player.scoreSessionId);
            if (!lock) continue;
            try {
                const peer = await readOwnedRun(player.scoreSessionId, player.userId);
                if (
                    !peer.multiplayer_lobby_id ||
                    normalizeLobbyCode(peer.multiplayer_lobby_id) !== normalizeLobbyCode(lobby.code) ||
                    peer.multiplayer_match_id !== lobby.matchId ||
                    (!peer.is_active && !peer.end_pending) ||
                    !peer.has_guessed_current_round ||
                    !isTerminalRound(peer) ||
                    !(await isCurrentRoundRevealed(peer, player.userId))
                )
                    continue;

                await finishGameSession(peer.id, player.userId, isContinuousVariant(peer.variant) ? "failed" : peer.end_reason);
            } catch (error) {
                console.error("Failed to finalize multiplayer Score PP session:", error);
            } finally {
                await releaseGameSessionLock(lock);
            }
        }
    } catch (error) {
        console.error("Failed to finalize multiplayer Score PP sessions:", error);
    }
}

async function acquireRunLock(sessionId: string): Promise<{ key: string; token: string }> {
    const lock = await acquireGameSessionLock(sessionId);
    if (!lock) throw new Error("Action in progress, please wait");
    return lock;
}

export async function startScorePpRunForUser(userId: number, variant: GameVariant, multiplayerLobbyCode?: string, requestedRunType: GameRunType = "standard"): Promise<string> {
    const parsedVariant = variantSchema.parse(variant);
    const runType = z.enum(["standard", "daily"]).parse(requestedRunType);
    if (runType === "daily" && (parsedVariant !== "classic" || multiplayerLobbyCode)) throw new Error("Daily challenges are available in single-player Classic mode only");

    const lobbyCode = multiplayerLobbyCode ? normalizeLobbyCode(multiplayerLobbyCode) : undefined;
    const lobby = lobbyCode ? await requireActiveMultiplayerLobby(lobbyCode, userId, GameMode.ScorePp, parsedVariant) : null;
    const lobbyPlayer = lobby?.players.find((player) => player.userId === userId);
    if (lobbyPlayer?.scoreSessionId) {
        try {
            const existingState = await resumeScorePpRunForUser(userId, lobbyPlayer.scoreSessionId);
            if (existingState.active) return lobbyPlayer.scoreSessionId;
        } catch {}
    }
    if (lobbyPlayer?.finished) throw new Error("You have already finished this match");
    const now = new Date();
    const dailyDate = runType === "daily" ? getDailyDate(now, env.DEBUG_DAILY_DAY_OFFSET) : undefined;
    const dailyDay = dailyDate ? getDailyChallengeDay(dailyDate) : undefined;
    if (dailyDate && userId !== 0) {
        const existingAttempt = await prisma.dailyGameAttempt.findUnique({
            where: { userId_dailyDate_gameMode: { userId, dailyDate, gameMode: GameMode.ScorePp } },
        });
        if (existingAttempt && !env.DEBUG_DAILY_UNLIMITED_ATTEMPTS) {
            const existingState = await resumeScorePpRunForUser(userId, existingAttempt.sessionId).catch(() => null);
            if (existingState?.active && existingState.runType === "daily") return existingAttempt.sessionId;
            throw new Error(DAILY_CHALLENGE_ALREADY_PLAYED);
        }
    }
    const scheduledDailyChallenge = dailyDate ? await getOrCreateDailyScorePpChallenge(dailyDate) : null;
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
        time_left: getRoundTime(runType),
        last_action_at: startedAt,
        last_guess: null,
        last_guess_correct: null,
        last_points: null,
        correct_guesses: 0,
        total_time_used: 0,
        total_response_time_ms: 0,
        is_active: true,
        variant: parsedVariant,
        ...(dailyDate && { daily_day: dailyDay, daily_date: dailyDate.toISOString() }),
        run_type: runType,
        challenge_id: scheduledDailyChallenge?.id ?? null,
        seed: dailyDate ? `daily:${dailyDate.toISOString().slice(0, 10)}:${GameMode.ScorePp}` : null,
        config_snapshot: dailyDate
            ? { dailyDay, dailyDate: dailyDate.toISOString().slice(0, 10), debugUnlimitedAttempts: env.DEBUG_DAILY_UNLIMITED_ATTEMPTS }
            : lobby
              ? { multiplayer: { matchId: lobby.matchId } }
              : null,
        ranked: runType !== "daily",
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
    await writeScorePpSession(run);
    if (dailyDate && userId !== 0) {
        try {
            const attemptKey = { userId, dailyDate, gameMode: GameMode.ScorePp };
            if (env.DEBUG_DAILY_UNLIMITED_ATTEMPTS) {
                await prisma.dailyGameAttempt.upsert({
                    where: { userId_dailyDate_gameMode: attemptKey },
                    create: { ...attemptKey, sessionId },
                    update: { sessionId, startedAt: new Date() },
                });
            } else {
                await prisma.dailyGameAttempt.create({ data: { ...attemptKey, sessionId } });
            }
        } catch (error) {
            await deleteGameSession(sessionId);
            if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new Error(DAILY_CHALLENGE_ALREADY_PLAYED);
            throw error;
        }
    }
    if (lobbyCode) {
        await updateMultiplayerProgress(lobbyCode, userId, { points: 0, round: 1, scoreSessionId: sessionId, finished: false }, lobby!.matchId).catch((error) =>
            console.error("Failed to update multiplayer progress:", error),
        );
    }
    return sessionId;
}

export async function createManualScorePpDailyChallenge(dailyDate: Date, selectedPairIds: number[], overwrite = false): Promise<void> {
    const pairIds = z.array(z.number().int().positive()).length(DAILY_ROUNDS).parse(selectedPairIds);
    if (new Set(pairIds).size !== DAILY_ROUNDS) throw new Error("Choose a different score pair for each round");
    if (!overwrite) {
        const existing = await prisma.gameChallenge.findUnique({
            where: { dailyDate_gameMode_variant: { dailyDate, gameMode: GameMode.ScorePp, variant: "classic" } },
            select: { id: true },
        });
        if (existing) throw new Error(DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED);
    }

    const batch = await prisma.scorePpBatch.findFirst({
        where: { status: "active" },
        orderBy: { activatedAt: "desc" },
        select: { id: true },
    });
    if (!batch) throw new Error("No active Score pp pair pool is available");

    const pairs = await getStoredScorePpPairsByIds(batch.id, pairIds);
    if (pairs.length !== DAILY_ROUNDS) throw new Error("One or more selected score pairs are unavailable in the active pool");

    await persistScorePpDailyChallenge(dailyDate, pairs, true, overwrite);
}

async function persistScorePpDailyChallenge(dailyDate: Date, pairs: ScorePpPairSnapshot[], manuallySet: boolean, overwrite = false) {
    const dateKey = dailyDate.toISOString().slice(0, 10);
    const rounds = await Promise.all(
        pairs.map(async (pair, index) => {
            const roundNumber = index + 1;
            const scheduledPair = {
                ...pair,
                difficultySnapshot: await getRoundDifficultySnapshot(GameMode.ScorePp, "score_pair", pair.id, CURRENT_RULESET_VERSION, CURRENT_PP_VERSION),
            };
            return {
                roundNumber,
                itemType: "score_pair" as const,
                itemId: pair.id,
                answerSnapshot: `Score pp pair ${roundNumber}`,
                difficultySnapshot: scheduledPair.difficultySnapshot,
                contentSnapshot: JSON.parse(JSON.stringify({ pair: scheduledPair })) as Prisma.InputJsonValue,
            };
        }),
    );

    const challengeId = crypto.randomUUID();
    return prisma.$transaction(async (transaction) => {
        const uniqueKey: Prisma.GameChallengeWhereUniqueInput = { dailyDate_gameMode_variant: { dailyDate, gameMode: GameMode.ScorePp, variant: "classic" } };
        const existing = overwrite ? await transaction.gameChallenge.findUnique({ where: uniqueKey, select: { id: true } }) : null;
        if (existing) {
            await transaction.gameChallengeRound.deleteMany({ where: { challengeId: existing.id } });
            await transaction.gameChallenge.delete({ where: { id: existing.id } });
        }
        const challenge = await transaction.gameChallenge.create({
            data: {
                id: challengeId,
                challengeType: "daily",
                gameMode: GameMode.ScorePp,
                variant: "classic",
                rulesetVersion: CURRENT_RULESET_VERSION,
                ppVersion: CURRENT_PP_VERSION,
                seed: `daily:${dateKey}:${GameMode.ScorePp}`,
                configSnapshot: { manuallySet, batchId: pairs[0].batchId },
                roundCount: DAILY_ROUNDS,
                timerMs: DAILY_ROUND_TIME * 1000,
                ranked: false,
                dailyDate,
            },
        });
        await transaction.gameChallengeRound.createMany({
            data: rounds.map((round) => ({ ...round, challengeId })),
        });
        return challenge;
    });
}

async function getOrCreateDailyScorePpChallenge(dailyDate: Date) {
    const where: Prisma.GameChallengeWhereUniqueInput = { dailyDate_gameMode_variant: { dailyDate, gameMode: GameMode.ScorePp, variant: "classic" } };
    const existing = await prisma.gameChallenge.findUnique({ where });
    if (existing) return existing;
    const lock = await acquireRedisLock(`daily_score_pp:${dailyDate.toISOString().slice(0, 10)}`, 60_000);
    if (!lock) throw new Error("Daily Score pp pool is being initialized; retry shortly");
    try {
        const ready = await prisma.gameChallenge.findUnique({ where });
        if (ready) return ready;
        const recent = env.DEBUG_DAILY_REUSE_CHECK ? await prisma.gameChallenge.findMany({ where: { challengeType: "daily", gameMode: GameMode.ScorePp, dailyDate: { gte: new Date(dailyDate.getTime() - 7 * 86_400_000), lt: dailyDate } }, select: { id: true } }) : [];
        const used = recent.length ? await prisma.gameChallengeRound.findMany({ where: { challengeId: { in: recent.map(challenge => challenge.id) }, itemType: "score_pair" }, select: { itemId: true } }) : [];
        const pairs: ScorePpPairSnapshot[] = [];
        const excluded = { pairIds: new Set(used.map(round => round.itemId)), scoreIds: new Set<string>(), userIds: new Set<number>(), beatmapIds: new Set<number>() };
        for (let round = 1; round <= DAILY_ROUNDS; round++) {
            const pair = await selectStoredScorePpPair(round, excluded, pairs[0]?.batchId);
            if (!pair || excluded.pairIds.has(pair.id)) throw new Error("Not enough unused Score pp pairs for today's daily");
            pairs.push(pair);
            excluded.pairIds.add(pair.id);
            for (const score of [pair.left, pair.right]) {
                excluded.scoreIds.add(score.sourceScoreId); excluded.userIds.add(score.player.userId); excluded.beatmapIds.add(score.beatmap.beatmapId);
            }
        }
        return await persistScorePpDailyChallenge(dailyDate, pairs, false);
    } finally { await releaseRedisLock(lock); }
}

async function getScheduledDailyScorePpPair(challengeId: string, roundNumber: number): Promise<ScorePpPairSnapshot> {
    const challengeRound = await prisma.gameChallengeRound.findUnique({
        where: { challengeId_roundNumber: { challengeId, roundNumber } },
    });
    const content = challengeRound?.contentSnapshot;
    const pair = content && typeof content === "object" && !Array.isArray(content) ? (content as { pair?: unknown }).pair : null;
    if (
        !challengeRound ||
        challengeRound.itemType !== "score_pair" ||
        !pair ||
        typeof pair !== "object" ||
        !("id" in pair) ||
        pair.id !== challengeRound.itemId ||
        !("left" in pair) ||
        !("right" in pair) ||
        !("batchId" in pair)
    ) {
        throw new Error("Scheduled Score pp daily round is unavailable");
    }
    return pair as ScorePpPairSnapshot;
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
            let existing = run.current_score_pp_pair ?? null;
            if (existing && (run.current_difficulty_snapshot === undefined || existing.difficultySnapshot === undefined)) {
                const difficultySnapshot = existing.difficultySnapshot ?? run.current_difficulty_snapshot ?? 1;
                existing = { ...existing, difficultySnapshot };
                await writeScorePpSession({ ...run, current_difficulty_snapshot: difficultySnapshot, current_score_pp_pair: existing });
            }
            return {
                pair: existing ? await toPublicPair(existing) : null,
                deadlineAt: existing ? getRoundDeadline(run) : null,
                terminal: false,
                saved: false,
            };
        }

        const exclusions = getRoundExclusions(run, parsedExclusions);
        const scheduledPair = run.run_type === "daily" && run.challenge_id ? await getScheduledDailyScorePpPair(run.challenge_id, parsedRound) : null;
        const selectPair = async () => {
            const pair =
                scheduledPair ??
                (await selectStoredScorePpPair(
                    parsedRound,
                    {
                        pairIds: new Set(run.round_history.map((item) => item.item_id)),
                        scoreIds: new Set(exclusions.scoreIds),
                        userIds: new Set(exclusions.userIds),
                        beatmapIds: new Set(exclusions.beatmapIds),
                    },
                    run.score_pp_batch_id,
                    Math.random,
                ));
            if (!pair) return null;
            return {
                ...pair,
                difficultySnapshot: pair.difficultySnapshot ?? (await getRoundDifficultySnapshot(GameMode.ScorePp, "score_pair", pair.id, run.ruleset_version, run.pp_version)),
            };
        };
        const selectedPair = run.multiplayer_lobby_id
            ? await getOrCreateMultiplayerRound<ScorePpPairSnapshot | null>(`${normalizeLobbyCode(run.multiplayer_lobby_id)}:${run.multiplayer_match_id}`, parsedRound, selectPair)
            : await selectPair();
        const pair = selectedPair ? { ...selectedPair, difficultySnapshot: selectedPair.difficultySnapshot ?? 1 } : null;
        if (!pair) {
            if (!isContinuousVariant(run.variant)) {
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
            time_left: getRoundTime(run.run_type),
            last_action_at: new Date(startedAt).toISOString(),
            last_guess: null,
            last_guess_correct: null,
            last_points: null,
            has_guessed_current_round: false,
            score_pp_batch_id: run.score_pp_batch_id ?? pair.batchId,
            current_difficulty_snapshot: pair.difficultySnapshot,
            current_score_pp_pair: pair,
        };
        await writeScorePpSession(nextRun);
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
            deadlineAt: startedAt + getRoundTime(run.run_type) * 1000,
            terminal: false,
            saved: false,
        };
    } finally {
        await releaseGameSessionLock(lock);
    }
}

export async function resumeScorePpRunForUser(userId: number, sessionId: string): Promise<ScorePpRunState> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);

    const lock = await acquireRunLock(parsedSessionId);
    let recoveredRun: DatabaseGameSession | null = null;
    try {
        let run = await expireDailyScorePpRun(await readOwnedRun(parsedSessionId, userId));
        recoveredRun = run;
        const allSubmitted = await isCurrentRoundRevealed(run, userId);
        if (allSubmitted && (run.end_pending || (run.is_active && run.has_guessed_current_round && isTerminalRound(run)))) {
            await finishGameSession(parsedSessionId, userId, isContinuousVariant(run.variant) && isTerminalRound(run) ? "failed" : run.end_reason);
            run = await readOwnedRun(parsedSessionId, userId);
        }
        return await toRunState(run, allSubmitted);
    } finally {
        await releaseGameSessionLock(lock);
        await finishTerminalMultiplayerRuns(recoveredRun);
    }
}

export async function endScorePpRunForUser(userId: number, sessionId: string): Promise<ScorePpRunEndResult> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const lock = await acquireRunLock(parsedSessionId);
    let endingRun: DatabaseGameSession | null = null;
    try {
        const run = await readOwnedRun(parsedSessionId, userId);
        endingRun = run;
        if (!(await isCurrentRoundRevealed(run, userId))) return { pending: true };
        if (!run.is_active && !run.end_pending) return run.pp ?? null;
        if (run.run_type === "daily") return (await expireDailyScorePpRun(run, true)).pp ?? null;
        const endReason = isTerminalRound(run) && isContinuousVariant(run.variant) ? "failed" : (run.end_reason ?? "quit");
        return await finishGameSession(parsedSessionId, userId, endReason);
    } finally {
        await releaseGameSessionLock(lock);
        await finishTerminalMultiplayerRuns(endingRun);
    }
}

export async function submitScorePpGuessForUser(
    userId: number,
    sessionId: string,
    pairId: number,
    selectedScoreId: string | null,
    submissionType: "guess" | "skip" | "timeout" = selectedScoreId === null ? "timeout" : "guess",
): Promise<ScorePpResolution | null> {
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedPairId = pairIdSchema.parse(pairId);
    const parsedSelectedScoreId = scoreIdSchema.parse(selectedScoreId);
    const parsedSubmissionType = submissionTypeSchema.parse(submissionType);
    if (parsedSubmissionType === "guess" && !parsedSelectedScoreId) throw new Error("A score choice is required");
    if (parsedSubmissionType !== "guess" && parsedSelectedScoreId) throw new Error("Skip and timeout submissions cannot include a score choice");

    const lock = await acquireRunLock(parsedSessionId);
    let submittedRun: DatabaseGameSession | null = null;
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
        const roundTime = getRoundTime(run.run_type);
        const roundTimeMs = roundTime * 1000;
        const elapsedMs = Math.max(0, now - new Date(run.last_action_at).getTime());
        let isSkipped = parsedSubmissionType === "skip";
        const isTimeout = parsedSubmissionType === "timeout";
        if (elapsedMs >= roundTimeMs + 1000 && !isSkipped) isSkipped = true;
        const resultType: GameRoundResult = isTimeout ? "timeout" : isSkipped ? "skip" : "guess";
        const selectedScoreId = resultType === "guess" ? parsedSelectedScoreId : null;
        const responseTimeMs = Math.min(elapsedMs, roundTimeMs);
        const timeLeft = Math.max(0, roundTime - Math.floor(elapsedMs / 1000));
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
            time_limit_ms: roundTimeMs,
            answered_at: new Date(now).toISOString(),
            points_earned: pointsEarned,
            streak_before: run.current_streak,
            streak_after: nextStreak,
            difficulty_snapshot: run.current_difficulty_snapshot ?? pair.difficultySnapshot ?? 1,
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
        const terminal = isTerminalRound(nextRun);
        await writeScorePpSession(nextRun);
        submittedRun = nextRun;
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

        const allSubmitted = await isCurrentRoundRevealed(nextRun, userId);
        const runPp = terminal && allSubmitted ? await finishGameSession(parsedSessionId, userId, isContinuousVariant(run.variant) ? "failed" : undefined) : undefined;
        if (!allSubmitted) return null;

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
        await finishTerminalMultiplayerRuns(submittedRun);
    }
}
