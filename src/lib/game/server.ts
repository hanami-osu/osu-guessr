import { prisma } from "@/lib/database/prisma";
import redisClient from "@/lib/infra/redis";
import { z } from "zod";
import { GAME_VARIANTS, getRoundTime, getGameRoundLimit, getVariantLives, isContinuousVariant, type GameVariant } from "@/app/games/config";
import { getDailyAudio, getDailyBackground, getDailySkin, getRandomAudio, getRandomBackground, getRandomSkin } from "./mapsets";
import { GameMode, type GameRunType, type MapsetDataWithTags, type GameState, type DatabaseGameSession, type GameEndReason, type PersistedGameRound, type SkinData } from "@/actions/types";
import { getMediaData } from "@/actions/media";
import { checkGuess } from "./guess-checker";
import type { GameRoundAction } from "./types";
import { calculateArcadeScore } from "./arcade-score";
import { catchUpDailyRounds } from "./daily-timing";
import { isNoGameContentError } from "./content-errors";
import { canPersistGameResult } from "./completion";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "./versioning";
import { calculateEmpiricalDifficulty, calculateProfilePp, calculateRunPp, type ContentPerformanceStats } from "./performance-points";
import { Prisma } from "@/generated/prisma/client";
import { acquireGameSessionLock, deleteGameSession, readOwnedGameSession, releaseGameSessionLock, writeGameSession } from "./session-storage";
import { getMultiplayerRoundState, getOrCreateMultiplayerRound, normalizeLobbyCode, readMultiplayerLobby, requireActiveMultiplayerLobby, updateMultiplayerProgress } from "@/lib/multiplayer/multiplayer";
import { DAILY_CHALLENGE_ALREADY_PLAYED, DAILY_ROUNDS, getDailyChallengeDay, getDailyDate, getNextDailyReset } from "./daily";
import { env } from "@/lib/infra/env";

const GRACE_PERIOD = 1;
const TRANSACTION_RETRY_LIMIT = 4;

function isTransactionWriteConflict(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

async function withTransactionRetry<T>(operation: () => Promise<T>, attempt = 0): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isTransactionWriteConflict(error) || attempt >= TRANSACTION_RETRY_LIMIT) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
        return withTransactionRetry(operation, attempt + 1);
    }
}

const roundActionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("guess"), guess: z.string().max(200).trim() }),
    z.object({ type: z.literal("skip") }),
    z.object({ type: z.literal("timeout") }),
    z.object({ type: z.literal("advance") }),
]);
const gameModeSchema = z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin]);
const dailyGameModeSchema = z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp]);
const gameVariantSchema = z.enum(GAME_VARIANTS);
const gameRunTypeSchema = z.enum(["standard", "daily"]);

function toPrismaJson(value: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
    return value ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue) : undefined;
}

async function releaseSessionLock(lock: Parameters<typeof releaseGameSessionLock>[0]): Promise<void> {
    try {
        await releaseGameSessionLock(lock);
    } catch (error) {
        console.error("Failed to release game session lock:", error);
    }
}

type GuessRoundItem = {
    data: MapsetDataWithTags | SkinData;
    difficultySnapshot?: number;
    challengeId?: string;
    backgroundData?: string;
    audioData?: string;
    skinData?: string;
};

async function getGuessRoundItem(gameMode: GameMode, sessionId: string, lobbyCode?: string, round = 1, multiplayerMatchId?: string, runType: GameRunType = "standard", dailyDay?: number): Promise<GuessRoundItem> {
    if (!lobbyCode) {
        if (runType === "daily") {
            if (dailyDay === undefined) throw new Error("Daily challenge date is missing");
            if (gameMode === GameMode.Audio) {
                const audio = await getDailyAudio(dailyDay, round);
                return { data: audio.data, challengeId: audio.challengeId, audioData: audio.audioData };
            }
            if (gameMode === GameMode.Background) {
                const background = await getDailyBackground(dailyDay, round);
                return { data: background.data, challengeId: background.challengeId, backgroundData: background.backgroundData };
            }
            if (gameMode === GameMode.Skin) {
                const skin = await getDailySkin(dailyDay, round);
                return { data: skin.data, challengeId: skin.challengeId, skinData: skin.skinData };
            }
            throw new Error("Unsupported daily game mode");
        }
        if (gameMode === GameMode.Audio) {
            const audio = await getRandomAudio(sessionId);
            return { data: audio.data, audioData: audio.audioData };
        }
        if (gameMode === GameMode.Background) {
            const background = await getRandomBackground(sessionId);
            return { data: background.data, backgroundData: background.backgroundData };
        }
        if (gameMode === GameMode.Skin) {
            const skin = await getRandomSkin(sessionId);
            return { data: skin.data, skinData: skin.skinData };
        }
        throw new Error("Unsupported multiplayer game mode");
    }

    if (!multiplayerMatchId) throw new Error("Game session belongs to a previous match");
    const roundNamespace = `${normalizeLobbyCode(lobbyCode)}:${multiplayerMatchId}`;
    const selectionId = `multiplayer_${normalizeLobbyCode(roundNamespace)}`;
    const data = await getOrCreateMultiplayerRound<(MapsetDataWithTags | SkinData) & { difficulty_snapshot?: number }>(roundNamespace, round, async () => {
        let selected: MapsetDataWithTags | SkinData;
        if (gameMode === GameMode.Audio) selected = (await getRandomAudio(selectionId)).data;
        else if (gameMode === GameMode.Background) selected = (await getRandomBackground(selectionId)).data;
        else if (gameMode === GameMode.Skin) selected = (await getRandomSkin(selectionId)).data;
        else throw new Error("Unsupported multiplayer game mode");

        const itemId = "mapset_id" in selected ? selected.mapset_id : selected.id;
        const itemType = "mapset_id" in selected ? "mapset" : "skin";
        const key = `session_items:${selectionId}:${itemType}`;
        await redisClient.sAdd(key, itemId.toString());
        await redisClient.expire(key, 3600);
        return { ...selected, difficulty_snapshot: await getRoundDifficultySnapshot(gameMode, itemType, itemId) };
    });

    if (gameMode === GameMode.Audio && "audio_filename" in data) {
        return { data, audioData: await getMediaData(GameMode.Audio, data.audio_filename), difficultySnapshot: data.difficulty_snapshot };
    }
    if (gameMode === GameMode.Background && "image_filename" in data) {
        return { data, backgroundData: await getMediaData(GameMode.Background, data.image_filename), difficultySnapshot: data.difficulty_snapshot };
    }
    if (gameMode === GameMode.Skin && "image_filename" in data) {
        return { data, skinData: await getMediaData(GameMode.Skin, data.image_filename), difficultySnapshot: data.difficulty_snapshot };
    }
    throw new Error("Multiplayer round content is invalid");
}

async function getGameSession(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const session = await readOwnedGameSession<DatabaseGameSession>(sessionId, userId, "Game session not found or expired");
    if (session.multiplayer_lobby_id) {
        const lobby = await readMultiplayerLobby(session.multiplayer_lobby_id);
        if (!lobby || lobby.matchId !== session.multiplayer_match_id) {
            throw new Error("Game session belongs to a previous match");
        }
    }
    return session;
}

async function validateGameSession(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const session = await getGameSession(sessionId, userId);
    if (!gameModeSchema.safeParse(session.game_mode).success || (userId === 0 && session.run_type !== "daily") || !session.is_active || session.end_pending) {
        throw new Error("Game session not found or expired");
    }
    return session;
}

function resolveEndReason(gameState: DatabaseGameSession, requestedReason?: GameEndReason): GameEndReason {
    if (gameState.end_reason) return gameState.end_reason;
    if (requestedReason === "quit" && gameState.variant === "classic" && gameState.current_round === getGameRoundLimit(gameState.run_type ?? "standard", gameState.variant) && gameState.has_guessed_current_round) {
        return "completed";
    }
    if (requestedReason) return requestedReason;
    return gameState.variant === "classic" ? "completed" : "quit";
}

export async function getRoundDifficultySnapshot(
    gameMode: GameMode,
    itemType: PersistedGameRound["item_type"],
    itemId: number,
    rulesetVersion = CURRENT_RULESET_VERSION,
    ppVersion = CURRENT_PP_VERSION,
): Promise<number> {
    const stats = await prisma.contentStat.findUnique({
        where: {
            gameMode_itemType_itemId_rulesetVersion_ppVersion: { gameMode, itemType, itemId, rulesetVersion, ppVersion },
        },
        select: {
            appearances: true,
            correctCount: true,
            totalResponseTimeMs: true,
        },
    });
    return calculateEmpiricalDifficulty(stats ? { appearances: Number(stats.appearances), correct_count: Number(stats.correctCount), total_response_time_ms: Number(stats.totalResponseTimeMs) } : undefined);
}

/** Attaches each round's current content stats, which classic pp weighs items by. */
async function withItemStats(gameMode: GameMode, rounds: PersistedGameRound[], rulesetVersion: number, ppVersion: number): Promise<Array<PersistedGameRound & { item_stats?: ContentPerformanceStats }>> {
    if (rounds.length === 0) return rounds;

    const stats = await prisma.contentStat.findMany({
        where: { gameMode, rulesetVersion, ppVersion, itemId: { in: [...new Set(rounds.map((round) => round.item_id))] } },
        select: { itemType: true, itemId: true, appearances: true, correctCount: true, totalResponseTimeMs: true },
    });
    const statsByItem = new Map(
        stats.map((stat) => [`${stat.itemType}:${stat.itemId}`, { appearances: Number(stat.appearances), correct_count: Number(stat.correctCount), total_response_time_ms: Number(stat.totalResponseTimeMs) }]),
    );

    return rounds.map((round) => ({ ...round, item_stats: statsByItem.get(`${round.item_type}:${round.item_id}`) }));
}

export async function finishGameSession(sessionId: string, userId: number, requestedReason?: GameEndReason): Promise<number | null> {
    const gameState = await getGameSession(sessionId, userId);
    if (!gameState.is_active && !gameState.end_pending) return gameState.pp ?? null;

    const endReason = resolveEndReason(gameState, requestedReason);
    const pendingState = { ...gameState, is_active: false, end_pending: true, end_reason: endReason };
    await writeGameSession(pendingState);

    if (
        !canPersistGameResult(
            {
                variant: gameState.variant,
                currentRound: gameState.current_round,
                hasGuessedCurrentRound: gameState.has_guessed_current_round,
            },
            getGameRoundLimit(gameState.run_type ?? "standard", gameState.variant),
        )
    ) {
        await writeGameSession({ ...pendingState, end_pending: false }, 120);
        if (gameState.multiplayer_lobby_id) {
            await updateMultiplayerProgress(
                gameState.multiplayer_lobby_id,
                userId,
                {
                    points: gameState.total_points,
                    round: gameState.current_round,
                    finished: true,
                },
                gameState.multiplayer_match_id ?? undefined,
            ).catch((error) => console.error("Failed to update multiplayer progress:", error));
        }
        return null;
    }

    const points = gameState.total_points;
    const roundHistory = (gameState.round_history ?? []).map((round) => ({ ...round, difficulty_snapshot: round.difficulty_snapshot ?? 1 }));
    const skipCount = roundHistory.filter((round) => round.result_type === "skip").length;
    const timeoutCount = roundHistory.filter((round) => round.result_type === "timeout").length;
    const totalResponseTimeMs = gameState.total_response_time_ms ?? roundHistory.reduce((total, round) => total + round.response_time_ms, 0);
    const rulesetVersion = gameState.ruleset_version ?? 0;
    const ppVersion = gameState.pp_version ?? 0;
    const ranked = gameState.ranked ?? true;
    const runPp = ranked ? calculateRunPp(gameState.variant === "classic" ? await withItemStats(gameState.game_mode, roundHistory, rulesetVersion, ppVersion) : roundHistory, gameState.variant) : 0;
    const finalizingState = { ...pendingState, round_history: roundHistory, pp: runPp };
    await writeGameSession(finalizingState);

    if (userId === 0 && gameState.run_type === "daily") {
        await writeGameSession({ ...finalizingState, end_pending: false }, 7 * 24 * 60 * 60);
        return runPp;
    }

    const persistedPp = await withTransactionRetry(() =>
        prisma.$transaction(
            async (tx) => {
                const existingGame = await tx.game.findUnique({ where: { sessionId } });
                if (existingGame) return Number(existingGame.pp);

                const persistedGame = await tx.game.create({
                    data: {
                        sessionId,
                        userId,
                        gameMode: gameState.game_mode,
                        points,
                        streak: gameState.highest_streak,
                        variant: gameState.variant,
                        runType: gameState.run_type ?? "standard",
                        challengeId: gameState.challenge_id ?? null,
                        seed: gameState.seed ?? null,
                        configSnapshot: toPrismaJson(gameState.config_snapshot),
                        ranked,
                        rulesetVersion,
                        ppVersion,
                        pp: runPp,
                        roundsPlayed: roundHistory.length,
                        correctCount: gameState.correct_guesses,
                        skipCount,
                        timeoutCount,
                        totalResponseTimeMs,
                        startedAt: new Date(gameState.started_at ?? Date.now()),
                        endReason,
                    },
                });

                if (roundHistory.length > 0) {
                    await tx.gameRound.createMany({
                        data: roundHistory.map((round) => ({
                            gameId: persistedGame.id,
                            roundNumber: round.round_number,
                            itemType: round.item_type,
                            itemId: round.item_id,
                            submittedGuess: round.submitted_guess,
                            answerSnapshot: round.answer_snapshot,
                            resultType: round.result_type,
                            correct: round.correct,
                            responseTimeMs: round.response_time_ms,
                            timeLimitMs: round.time_limit_ms,
                            answeredAt: round.answered_at ? new Date(round.answered_at) : null,
                            pointsEarned: round.points_earned,
                            streakBefore: round.streak_before,
                            streakAfter: round.streak_after,
                            difficultySnapshot: round.difficulty_snapshot,
                            contentSnapshot: toPrismaJson(round.content_snapshot),
                        })),
                    });
                }

                if (!ranked) return runPp;

                for (const round of roundHistory) {
                    const statKey = {
                        gameMode: gameState.game_mode,
                        itemType: round.item_type,
                        itemId: round.item_id,
                        rulesetVersion,
                        ppVersion,
                    };
                    const contribution = await tx.contentStatContribution.createMany({
                        data: [
                            {
                                userId,
                                ...statKey,
                                correct: round.correct,
                                resultType: round.result_type,
                                responseTimeMs: round.response_time_ms,
                            },
                        ],
                        skipDuplicates: true,
                    });
                    if (contribution.count === 0) continue;

                    const persistedStats = await tx.contentStat.findUnique({
                        where: { gameMode_itemType_itemId_rulesetVersion_ppVersion: statKey },
                        select: {
                            appearances: true,
                            correctCount: true,
                            totalResponseTimeMs: true,
                            fastestCorrectMs: true,
                        },
                    });
                    const nextDifficulty = calculateEmpiricalDifficulty({
                        appearances: Number(persistedStats?.appearances ?? 0) + 1,
                        correct_count: Number(persistedStats?.correctCount ?? 0) + (round.correct ? 1 : 0),
                        total_response_time_ms: Number(persistedStats?.totalResponseTimeMs ?? 0) + round.response_time_ms,
                    });
                    const fastestCorrectMs = round.correct ? Math.min(persistedStats?.fastestCorrectMs ?? round.response_time_ms, round.response_time_ms) : undefined;

                    await tx.contentStat.upsert({
                        where: { gameMode_itemType_itemId_rulesetVersion_ppVersion: statKey },
                        create: {
                            ...statKey,
                            appearances: 1,
                            correctCount: round.correct ? 1 : 0,
                            skipCount: round.result_type === "skip" ? 1 : 0,
                            timeoutCount: round.result_type === "timeout" ? 1 : 0,
                            totalResponseTimeMs: round.response_time_ms,
                            fastestCorrectMs: round.correct ? round.response_time_ms : null,
                            empiricalDifficulty: nextDifficulty,
                        },
                        update: {
                            appearances: { increment: 1 },
                            correctCount: { increment: round.correct ? 1 : 0 },
                            skipCount: { increment: round.result_type === "skip" ? 1 : 0 },
                            timeoutCount: { increment: round.result_type === "timeout" ? 1 : 0 },
                            totalResponseTimeMs: { increment: round.response_time_ms },
                            ...(fastestCorrectMs === undefined ? {} : { fastestCorrectMs }),
                            empiricalDifficulty: nextDifficulty,
                        },
                    });
                }

                const achievementKey = {
                    userId,
                    gameMode: gameState.game_mode,
                    variant: gameState.variant,
                    rulesetVersion,
                    ppVersion,
                };
                const [existingAchievement, topRuns] = await Promise.all([
                    tx.userAchievement.findUnique({
                        where: { userId_gameMode_variant_rulesetVersion_ppVersion: achievementKey },
                    }),
                    tx.game.findMany({
                        where: {
                            ...achievementKey,
                            ranked: true,
                            pp: { gt: 0 },
                        },
                        select: { pp: true },
                        orderBy: [{ pp: "desc" }, { endedAt: "asc" }],
                        take: 100,
                    }),
                ]);
                const profilePp = calculateProfilePp(
                    topRuns.map(({ pp }) => Number(pp)),
                    gameState.variant,
                );

                await tx.userAchievement.upsert({
                    where: { userId_gameMode_variant_rulesetVersion_ppVersion: achievementKey },
                    create: {
                        ...achievementKey,
                        totalScore: points,
                        gamesPlayed: 1,
                        roundsPlayed: roundHistory.length,
                        totalCorrect: gameState.correct_guesses,
                        totalSkips: skipCount,
                        totalTimeouts: timeoutCount,
                        totalResponseTimeMs,
                        highestStreak: gameState.highest_streak,
                        highestScore: points,
                        bestRunPp: runPp,
                        profilePp,
                        lastPlayed: persistedGame.endedAt,
                    },
                    update: {
                        totalScore: { increment: points },
                        gamesPlayed: { increment: 1 },
                        roundsPlayed: { increment: roundHistory.length },
                        totalCorrect: { increment: gameState.correct_guesses },
                        totalSkips: { increment: skipCount },
                        totalTimeouts: { increment: timeoutCount },
                        totalResponseTimeMs: { increment: totalResponseTimeMs },
                        highestStreak: Math.max(existingAchievement?.highestStreak ?? 0, gameState.highest_streak),
                        highestScore: Math.max(existingAchievement?.highestScore ?? 0, points),
                        bestRunPp: Math.max(Number(existingAchievement?.bestRunPp ?? 0), runPp),
                        profilePp,
                        lastPlayed: persistedGame.endedAt,
                    },
                });

                return runPp;
            },
            { isolationLevel: "Serializable" },
        ),
    );

    await writeGameSession({ ...finalizingState, pp: persistedPp, end_pending: false }, gameState.run_type === "daily" ? 7 * 24 * 60 * 60 : 120);
    if (gameState.multiplayer_lobby_id) {
        await updateMultiplayerProgress(
            gameState.multiplayer_lobby_id,
            userId,
            {
                points,
                round: gameState.current_round,
                scoreSessionId: sessionId,
                results: {
                    correct: roundHistory.filter((round) => round.correct).length,
                    incorrect: roundHistory.filter((round) => !round.correct && round.result_type === "guess").length,
                    skipped: skipCount,
                    timedOut: timeoutCount,
                },
                finished: true,
                completedMatch: endReason !== "quit",
            },
            gameState.multiplayer_match_id ?? undefined,
        ).catch((error) => console.error("Failed to update multiplayer progress:", error));
    }
    return persistedPp;
}

export async function startGameForUser(userId: number, gameMode: GameMode, variant: GameVariant = "classic", multiplayerLobbyCode?: string, requestedRunType: GameRunType = "standard"): Promise<GameState> {
    gameMode = gameModeSchema.parse(gameMode);
    variant = gameVariantSchema.parse(variant);
    const runType = gameRunTypeSchema.parse(requestedRunType);
    const roundTime = getRoundTime(runType);
    if (runType === "daily" && (variant !== "classic" || multiplayerLobbyCode)) throw new Error("Daily challenges are available in single-player Classic mode only");
    const lobbyCode = multiplayerLobbyCode ? normalizeLobbyCode(multiplayerLobbyCode) : undefined;
    const lobby = lobbyCode ? await requireActiveMultiplayerLobby(lobbyCode, userId, gameMode, variant) : null;
    const lobbyPlayer = lobby?.players.find((player) => player.userId === userId);
    if (lobbyPlayer?.scoreSessionId) {
        try {
            const existingState = await resumeGameForUser(userId, lobbyPlayer.scoreSessionId);
            if (existingState.gameStatus === "active") return existingState;
        } catch {}
    }
    if (lobbyPlayer?.finished) throw new Error("You have already finished this match");
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const dailyDate = runType === "daily" ? getDailyDate(now, env.DEBUG_DAILY_DAY_OFFSET) : undefined;
    const contentDay = dailyDate ? getDailyChallengeDay(dailyDate) : undefined;
    const dailyDay = contentDay;

    if (dailyDate && userId !== 0) {
        const existingAttempt = await prisma.dailyGameAttempt.findUnique({
            where: { userId_dailyDate_gameMode: { userId, dailyDate, gameMode } },
        });
        if (existingAttempt && !env.DEBUG_DAILY_UNLIMITED_ATTEMPTS) {
            try {
                const existingState = await resumeGameForUser(userId, existingAttempt.sessionId);
                if (existingState.gameStatus === "active" && existingState.runType === "daily") return existingState;
            } catch {}

            const existingGame = await prisma.game.findUnique({ where: { sessionId: existingAttempt.sessionId }, select: { id: true } });
            if (existingGame) throw new Error(DAILY_CHALLENGE_ALREADY_PLAYED);
            throw new Error(DAILY_CHALLENGE_ALREADY_PLAYED);
        }
    }

    const item = await getGuessRoundItem(gameMode, sessionId, lobbyCode, 1, lobby?.matchId, runType, contentDay);

    const itemId = gameMode === GameMode.Skin ? (item.data as SkinData).id : (item.data as MapsetDataWithTags).mapset_id;
    const itemType = gameMode === GameMode.Skin ? "skin" : "mapset";
    const difficultySnapshot = item.difficultySnapshot ?? (await getRoundDifficultySnapshot(gameMode, itemType, itemId));

    await Promise.all([deleteGameSession(sessionId), redisClient.del(`session_items:${sessionId}:mapset`), redisClient.del(`session_items:${sessionId}:skin`)]);

    const sessionItemsKey = `session_items:${sessionId}:${itemType}`;
    await redisClient.sAdd(sessionItemsKey, itemId.toString());
    await redisClient.expire(sessionItemsKey, 3600);

    const roundStartedAt = lobby?.startAt ?? Date.now();
    const startedAt = new Date(roundStartedAt).toISOString();
    const initialTimeLeft = lobby ? Math.max(0, Math.min(roundTime, roundTime - Math.floor((Date.now() - roundStartedAt) / 1000))) : roundTime;
    await writeGameSession({
        id: sessionId,
        user_id: userId,
        game_mode: gameMode,
        total_points: 0,
        current_streak: 0,
        highest_streak: 0,
        current_round: 1,
        current_item_id: itemId,
        current_difficulty_snapshot: difficultySnapshot,
        time_left: roundTime,
        last_guess: null,
        last_guess_correct: null,
        last_points: null,
        correct_guesses: 0,
        total_time_used: 0,
        total_response_time_ms: 0,
        is_active: true,
        variant: variant,
        run_type: runType,
        challenge_id: item.challengeId ?? null,
        seed: dailyDate ? `daily:${dailyDate.toISOString().slice(0, 10)}:${gameMode}` : null,
        config_snapshot: dailyDate ? { dailyDay, dailyDate: dailyDate.toISOString().slice(0, 10), debugUnlimitedAttempts: env.DEBUG_DAILY_UNLIMITED_ATTEMPTS } : lobby ? { multiplayer: { matchId: lobby.matchId } } : null,
        ranked: runType !== "daily",
        ruleset_version: CURRENT_RULESET_VERSION,
        pp_version: CURRENT_PP_VERSION,
        started_at: startedAt,
        round_history: [],
        title: "mapset_id" in item.data ? (item.data as MapsetDataWithTags).title : (item.data as SkinData).name,
        artist: (item.data as MapsetDataWithTags).artist,
        mapper: (item.data as MapsetDataWithTags).mapper,
        image_filename: "mapset_id" in item.data ? (item.data as MapsetDataWithTags).image_filename : (item.data as SkinData).image_filename,
        audio_filename: "mapset_id" in item.data ? (item.data as MapsetDataWithTags).audio_filename : null,
        has_guessed_current_round: false,
        multiplayer_lobby_id: lobbyCode ?? null,
        multiplayer_match_id: lobby?.matchId ?? null,
        ...(dailyDate && { daily_date: dailyDate.toISOString(), daily_day: dailyDay, daily_started_at: null }),
        last_action_at: startedAt,
    }, runType === "daily" ? 24 * 60 * 60 : undefined);

    if (dailyDate && userId !== 0) {
        try {
            const attemptKey = { userId, dailyDate, gameMode };
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
            await Promise.all([deleteGameSession(sessionId), redisClient.del(`session_items:${sessionId}:mapset`), redisClient.del(`session_items:${sessionId}:skin`)]);
            if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new Error(DAILY_CHALLENGE_ALREADY_PLAYED);
            throw error;
        }
    }

    if (lobbyCode) {
        await updateMultiplayerProgress(lobbyCode, userId, { points: 0, round: 1, scoreSessionId: sessionId, finished: false }, lobby!.matchId).catch((error) =>
            console.error("Failed to update multiplayer progress:", error),
        );
    }

    const dailyMedia = runType === "daily" ? await Promise.all(Array.from({ length: DAILY_ROUNDS }, async (_, i) => {
        const round = i === 0 ? item : await getGuessRoundItem(gameMode, sessionId, undefined, i + 1, undefined, "daily", contentDay);
        return round.audioData ?? round.backgroundData ?? round.skinData ?? "";
    })) : undefined;
    const currentBeatmap =
        gameMode === GameMode.Audio
            ? { audioUrl: "audioData" in item ? item.audioData : undefined, revealed: false }
            : gameMode === GameMode.Background
              ? { imageUrl: "backgroundData" in item ? item.backgroundData : undefined, revealed: false }
              : { imageUrl: "skinData" in item ? item.skinData : undefined, revealed: false };

    return {
        sessionId,
        currentBeatmap,
        score: {
            total: 0,
            current: 0,
            streak: 0,
            highestStreak: 0,
        },
        rounds: {
            current: 1,
            total: getGameRoundLimit(runType, variant),
            correctGuesses: 0,
            totalTimeUsed: 0,
            mistakes: 0,
        },
        timeLeft: initialTimeLeft,
        gameStatus: "active",
        variant,
        runType,
        dailyDay,
        dailyMedia,
    };
}

export async function getGuestDailyResult(sessionId: string) {
    const state = await getGameSession(z.string().uuid().parse(sessionId), 0);
    if (state.run_type !== "daily" || state.is_active || state.end_pending || state.current_round < DAILY_ROUNDS || !state.has_guessed_current_round) {
        throw new Error("Daily result is unavailable");
    }
    return {
        sessionId,
        gameMode: state.game_mode,
        day: state.daily_day ?? getDailyChallengeDay(new Date()),
        points: state.total_points,
        correct: state.correct_guesses,
        highestStreak: state.highest_streak,
        totalResponseTimeMs: state.total_response_time_ms,
        endedAt: new Date(state.last_action_at).toISOString(),
        outcomes: state.round_history.map((round) => ({ correct: round.correct, resultType: round.result_type, answer: round.answer_snapshot, guess: round.submitted_guess })),
    };
}

export async function claimGuestDailyResult(userId: number, sessionId: string): Promise<string> {
    const guestState = await getGameSession(z.string().uuid().parse(sessionId), 0);
    if (guestState.run_type !== "daily" || guestState.is_active || guestState.end_pending || guestState.current_round < DAILY_ROUNDS || !guestState.has_guessed_current_round) {
        throw new Error("Daily result is unavailable");
    }
    const dailyDate = getDailyDate(new Date(guestState.daily_date ?? Date.now()), 0);
    const key = { userId, dailyDate, gameMode: guestState.game_mode };

    try {
        await prisma.dailyGameAttempt.create({ data: { ...key, sessionId } });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
            const existing = await prisma.dailyGameAttempt.findUnique({ where: { userId_dailyDate_gameMode: key } });
            if (existing?.sessionId === sessionId) return sessionId;
            if (existing) {
                const existingGame = await prisma.game.findUnique({
                    where: { sessionId: existing.sessionId },
                    select: { id: true, runType: true, endReason: true, roundsPlayed: true },
                });
                if (existingGame?.runType === "daily" && existingGame.endReason === "completed" && existingGame.roundsPlayed === DAILY_ROUNDS) {
                    return existingGame.id.toString();
                }
            }
            throw new Error(DAILY_CHALLENGE_ALREADY_PLAYED);
        }
        throw error;
    }

    const ownedState = { ...guestState, user_id: userId, is_active: true, end_pending: false, end_reason: undefined };
    await writeGameSession(ownedState, 7 * 24 * 60 * 60);
    await finishGameSession(sessionId, userId, "completed");
    return sessionId;
}

export async function applyGameRoundForUser(userId: number, sessionId: string, action: GameRoundAction): Promise<GameState> {
    sessionId = z.string().uuid().parse(sessionId);
    const roundAction = roundActionSchema.parse(action);
    const lock = await acquireGameSessionLock(sessionId);
    if (!lock) throw new Error("Action in progress, please wait");

    try {
        const game = await expireDailyGame(await validateGameSession(sessionId, userId));
        if (!game.is_active) throw new Error("Daily challenge is complete");
        if (game.daily_started_at === null) throw new Error("Daily media has not finished loading");
        if (roundAction.type !== "advance" && game.has_guessed_current_round) throw new Error("Already submitted a guess for this round");
        if (roundAction.type === "advance" && !game.has_guessed_current_round) {
            throw new Error("You must make a guess, skip, or let the timer run out before advancing to the next round");
        }
        if (game.current_round > getGameRoundLimit(game.run_type, game.variant)) throw new Error("Game is complete");

        if (roundAction.type === "advance") return await advanceRound(game);
        return await resolveRound(game, roundAction);
    } finally {
        await releaseSessionLock(lock);
    }
}

async function getCurrentRoundContent(game: DatabaseGameSession) {
    if (game.game_mode === GameMode.Skin) {
        const skin = await prisma.skin.findUnique({ where: { id: game.current_item_id } });
        if (!skin) throw new Error("Current skin could not be resolved");
        return { title: skin.name, artist: undefined, mapper: undefined, itemType: "skin" as const, snapshot: { name: skin.name } };
    }

    const mapset = await prisma.mapsetData.findUnique({ where: { mapsetId: game.current_item_id } });
    if (!mapset) throw new Error("Current mapset could not be resolved");
    const title = mapset.title ?? "";
    const artist = mapset.artist ?? "";
    const mapper = mapset.mapper ?? "";
    return {
        title, artist, mapper, itemType: "mapset" as const,
        snapshot: {
            title, artist, mapper, rankedAt: mapset.rankedAt,
            starRatingMin: mapset.starRatingMin == null ? null : Number(mapset.starRatingMin),
            starRatingMax: mapset.starRatingMax == null ? null : Number(mapset.starRatingMax),
        },
    };
}

async function getRoundMedia(game: DatabaseGameSession): Promise<string | undefined> {
    if (game.run_type === "daily") return undefined;
    return getMediaData(game.game_mode, game.game_mode === GameMode.Audio ? game.audio_filename : game.image_filename);
}

async function resolveRound(game: DatabaseGameSession, action: Exclude<GameRoundAction, { type: "advance" }>): Promise<GameState> {
    const actionTimeMs = Date.now();
    const roundTime = getRoundTime(game.run_type);
    const elapsedMs = Math.max(0, actionTimeMs - new Date(game.last_action_at).getTime());
    const rawTimeLeft = Math.min(game.time_left, roundTime) - Math.floor(elapsedMs / 1000);
    const timeLeft = Math.max(0, rawTimeLeft);
    const guess = action.type === "guess" ? action.guess : "";
    const timedOut = action.type === "timeout" || (action.type === "guess" && !guess);
    const skipped = action.type === "skip" || rawTimeLeft <= -GRACE_PERIOD;
    const resultType = timedOut ? "timeout" : skipped ? "skip" : "guess";
    const item = await getCurrentRoundContent(game);
    const media = await getRoundMedia(game);
    const answer = game.run_type === "daily" ? game.title : item.title;
    const correct = resultType === "guess" && checkGuess(guess, answer, 0.5);
    const points = calculateArcadeScore(correct, timeLeft, game.current_streak);
    const streak = correct ? game.current_streak + 1 : 0;
    const responseTimeMs = Math.min(elapsedMs, roundTime * 1000);
    const round: PersistedGameRound = {
        round_number: game.current_round,
        item_type: item.itemType,
        item_id: game.current_item_id,
        submitted_guess: resultType === "guess" ? guess : null,
        answer_snapshot: answer,
        result_type: resultType,
        correct,
        response_time_ms: responseTimeMs,
        time_limit_ms: roundTime * 1000,
        answered_at: new Date(actionTimeMs).toISOString(),
        points_earned: points,
        streak_before: game.current_streak,
        streak_after: streak,
        difficulty_snapshot: game.current_difficulty_snapshot ?? 1,
        content_snapshot: item.snapshot,
    };
    const updated: DatabaseGameSession = {
        ...game,
        total_points: game.total_points + points,
        current_streak: streak,
        highest_streak: Math.max(game.highest_streak, streak),
        current_difficulty_snapshot: round.difficulty_snapshot ?? 1,
        time_left: timeLeft,
        last_action_at: new Date().toISOString(),
        last_guess: timedOut ? "TIMEOUT" : skipped ? "SKIPPED" : guess,
        last_guess_correct: correct ? 1 : 0,
        last_points: points,
        correct_guesses: game.correct_guesses + Number(correct),
        total_time_used: game.total_time_used + roundTime - timeLeft,
        total_response_time_ms: (game.total_response_time_ms ?? 0) + responseTimeMs,
        round_history: [...(game.round_history ?? []), round],
        has_guessed_current_round: true,
    };
    const continuous = isContinuousVariant(game.variant);
    const failed = continuous && updated.round_history.filter((entry) => !entry.correct).length >= getVariantLives(game.variant);
    if (failed) {
        updated.is_active = false;
        updated.end_pending = true;
        updated.end_reason = "failed";
    }
    await writeGameSession(updated, game.run_type === "daily" ? 24 * 60 * 60 : undefined);

    if (game.multiplayer_lobby_id) {
        await updateMultiplayerProgress(
            game.multiplayer_lobby_id,
            game.user_id,
            {
                points: updated.total_points,
                round: game.current_round,
                submittedRound: game.current_round,
                resultRound: game.current_round,
                resultCorrect: correct,
                resultSkipped: skipped,
                resultPoints: points,
                finished: failed,
            },
            game.multiplayer_match_id ?? undefined,
        ).catch((error) => console.error("Failed to update multiplayer progress:", error));
    }
    if (continuous && !correct && !failed) {
        await redisClient.sRem(`session_items:${game.id}:${item.itemType}`, game.current_item_id.toString());
    }

    const pp = failed ? await finishGameSession(game.id, game.user_id, "failed") : null;
    const state = presentGame(updated, media, failed ? 0 : timeLeft);
    state.currentBeatmap = { ...state.currentBeatmap, title: answer, artist: item.artist, mapper: item.mapper };
    state.lastGuess = { correct, answer, type: resultType };
    state.pp = pp ?? undefined;
    if (failed) {
        state.rounds.total = game.current_round;
    }
    return state;
}

async function advanceRound(game: DatabaseGameSession): Promise<GameState> {
    if (game.multiplayer_lobby_id) {
        const state = await getMultiplayerRoundState(game.multiplayer_lobby_id, game.user_id, game.current_round);
        if (!state.allReady) throw new Error("Waiting for other players");
    }
    if (isContinuousVariant(game.variant) && (game.round_history ?? []).filter((entry) => !entry.correct).length >= getVariantLives(game.variant)) {
        const media = await getRoundMedia(game);
        const pp = await finishGameSession(game.id, game.user_id, "failed");
        const state = presentGame({ ...game, is_active: false, pp: pp ?? undefined }, media, 0);
        state.rounds.total = game.current_round;
        return state;
    }

    let next: GuessRoundItem;
    try {
        next = await getGuessRoundItem(
            game.game_mode,
            game.id,
            game.multiplayer_lobby_id ?? undefined,
            game.current_round + 1,
            game.multiplayer_match_id ?? undefined,
            game.run_type,
            game.daily_date ? getDailyChallengeDay(new Date(game.daily_date)) : game.daily_day,
        );
    } catch (error) {
        if (!isContinuousVariant(game.variant) || !isNoGameContentError(error)) throw error;
        const item = await getCurrentRoundContent(game);
        const media = await getRoundMedia(game);
        const pp = await finishGameSession(game.id, game.user_id, "content_exhausted");
        const state = presentGame({ ...game, is_active: false, last_points: 0, pp: pp ?? undefined }, media, 0);
        state.currentBeatmap = { ...state.currentBeatmap, revealed: true, title: item.title, artist: item.artist, mapper: item.mapper, mapsetId: game.current_item_id };
        state.rounds.total = game.current_round;
        state.lastGuess = undefined;
        return state;
    }

    const item = next.data;
    const isMapset = "mapset_id" in item;
    const itemId = isMapset ? item.mapset_id : item.id;
    const itemType = isMapset ? "mapset" : "skin";
    const updated: DatabaseGameSession = {
        ...game,
        current_round: game.current_round + 1,
        current_item_id: itemId,
        current_difficulty_snapshot: next.difficultySnapshot ?? (await getRoundDifficultySnapshot(game.game_mode, itemType, itemId, game.ruleset_version, game.pp_version)),
        title: isMapset ? item.title : item.name,
        artist: isMapset ? item.artist : "",
        mapper: isMapset ? item.mapper : "",
        image_filename: item.image_filename,
        audio_filename: isMapset ? item.audio_filename : null,
        time_left: getRoundTime(game.run_type),
        last_action_at: new Date().toISOString(),
        last_guess: null,
        last_guess_correct: 0,
        last_points: 0,
        has_guessed_current_round: false,
    };
    await writeGameSession(updated, game.run_type === "daily" ? 24 * 60 * 60 : undefined);

    if (game.multiplayer_lobby_id) {
        await updateMultiplayerProgress(
            game.multiplayer_lobby_id,
            game.user_id,
            { points: updated.total_points, round: updated.current_round, finished: false },
            game.multiplayer_match_id ?? undefined,
        ).catch((error) => console.error("Failed to update multiplayer progress:", error));
    }
    const sessionItemsKey = `session_items:${game.id}:${itemType}`;
    await redisClient.sAdd(sessionItemsKey, itemId.toString());
    await redisClient.expire(sessionItemsKey, 3600);

    const media = game.run_type === "daily" ? undefined : next.audioData ?? next.backgroundData ?? next.skinData;
    return presentGame(updated, media, updated.time_left);
}

async function expireDailyGame(game: DatabaseGameSession, force = false): Promise<DatabaseGameSession> {
    if (game.run_type !== "daily" || !game.is_active || game.daily_started_at === null) return game;
    const updated = await catchUpDailyRounds(
        game,
        force,
        async (round) => {
            const { data } = await getGuessRoundItem(game.game_mode, game.id, undefined, round, undefined, "daily", game.daily_day);
            const isMapset = "mapset_id" in data;
            return {
                current_item_id: isMapset ? data.mapset_id : data.id,
                title: isMapset ? data.title : data.name,
                artist: isMapset ? data.artist : undefined,
                mapper: isMapset ? data.mapper : undefined,
                image_filename: data.image_filename,
                audio_filename: isMapset ? data.audio_filename : "",
            };
        },
        (state) => ({
            item_type: state.game_mode === GameMode.Skin ? "skin" : "mapset",
            item_id: state.current_item_id,
            answer_snapshot: state.title,
            difficulty_snapshot: state.current_difficulty_snapshot ?? 1,
            content_snapshot: { title: state.title, artist: state.artist, mapper: state.mapper },
        }),
    );
    if (updated !== game) await writeGameSession(updated, 24 * 60 * 60);
    if (updated.current_round === DAILY_ROUNDS && updated.has_guessed_current_round) {
        await finishGameSession(game.id, game.user_id, "completed");
        return getGameSession(game.id, game.user_id);
    }
    return updated;
}

export async function beginDailyGameForUser(userId: number, sessionId: string): Promise<GameState> {
    const lock = await acquireGameSessionLock(z.string().uuid().parse(sessionId));
    if (!lock) throw new Error("Action in progress, please wait");
    try {
        const game = await validateGameSession(sessionId, userId);
        if (game.run_type !== "daily") throw new Error("Not a daily session");
        if (game.daily_started_at === null) {
            const started = new Date().toISOString();
            await writeGameSession({ ...game, daily_started_at: started, started_at: started, last_action_at: started }, 24 * 60 * 60);
        }
    } finally { await releaseSessionLock(lock); }
    return resumeGameForUser(userId, sessionId, false);
}

export async function resumeGameForUser(userId: number, sessionId: string, includeDailyMedia = true): Promise<GameState> {
    sessionId = z.string().uuid().parse(sessionId);

    let gameState = await getGameSession(sessionId, userId);
    if (!gameModeSchema.safeParse(gameState.game_mode).success) throw new Error("Game session not found or expired");
    if (userId === 0 && gameState.run_type !== "daily") throw new Error("Game session not found or expired");
    if (gameState.run_type === "daily" && gameState.is_active && gameState.daily_started_at !== null) {
        const lock = await acquireGameSessionLock(sessionId);
        if (!lock) throw new Error("Action in progress, please wait");
        try { gameState = await expireDailyGame(await getGameSession(sessionId, userId)); }
        finally { await releaseSessionLock(lock); }
    }
    if (gameState.end_pending) {
        const lock = await acquireGameSessionLock(sessionId);
        if (!lock) throw new Error("Action in progress, please wait");

        try {
            await finishGameSession(sessionId, userId);
            gameState = await getGameSession(sessionId, userId);
        } finally {
            await releaseSessionLock(lock);
        }
    }

    const timeElapsed = gameState.has_guessed_current_round || gameState.daily_started_at === null ? 0 : Math.floor((Date.now() - new Date(gameState.last_action_at).getTime()) / 1000);
    const timeLeft = Math.max(0, Math.min(gameState.time_left, getRoundTime(gameState.run_type)) - timeElapsed);

    let dailyMedia: string[] | undefined;
    if (includeDailyMedia && gameState.run_type === "daily" && gameState.is_active) {
        dailyMedia = await Promise.all(Array.from({ length: DAILY_ROUNDS }, async (_, i) => {
            const item = await getGuessRoundItem(gameState.game_mode, sessionId, undefined, i + 1, undefined, "daily", gameState.daily_day);
            return item.audioData ?? item.backgroundData ?? item.skinData ?? "";
        }));
    }
    const state = presentGame(gameState, await getRoundMedia(gameState), timeLeft);
    return { ...state, dailyMedia };
}

function presentGame(gameState: DatabaseGameSession, media: string | undefined, timeLeft: number): GameState {
    return {
        sessionId: gameState.id,
        pp: gameState.pp,
        currentBeatmap: {
            imageUrl: gameState.game_mode === GameMode.Audio ? undefined : media,
            audioUrl: gameState.game_mode === GameMode.Audio ? media : undefined,
            revealed: Boolean(gameState.last_guess),
            title: gameState.last_guess ? gameState.title : undefined,
            artist: gameState.last_guess ? gameState.artist : undefined,
            mapper: gameState.last_guess ? gameState.mapper : undefined,
            mapsetId: gameState.last_guess ? gameState.current_item_id : undefined,
        },
        score: {
            total: gameState.total_points,
            current: gameState.last_points || 0,
            streak: gameState.current_streak,
            highestStreak: gameState.highest_streak,
        },
        rounds: {
            current: gameState.current_round,
            total: getGameRoundLimit(gameState.run_type ?? "standard", gameState.variant),
            correctGuesses: gameState.correct_guesses,
            totalTimeUsed: gameState.total_time_used,
            mistakes: (gameState.round_history ?? []).filter((round) => !round.correct).length,
        },
        timeLeft,
        gameStatus: gameState.is_active ? "active" : "finished",
        variant: gameState.variant as GameVariant,
        runType: gameState.run_type ?? "standard",
        dailyDay: gameState.daily_day,
        lastGuess: gameState.last_guess
            ? {
                  correct: gameState.last_guess_correct === 1,
                  answer: gameState.title,
                  type: gameState.last_guess === "TIMEOUT" ? "timeout" : gameState.last_guess === "SKIPPED" ? "skip" : "guess",
              }
            : undefined,
    };
}

export async function endGameForUser(userId: number, sessionId: string): Promise<number | null> {
    sessionId = z.string().uuid().parse(sessionId);
    const session = await getGameSession(sessionId, userId);
    if (session.run_type === "daily" && session.is_active) {
        const lock = await acquireGameSessionLock(sessionId);
        if (!lock) throw new Error("Action in progress, please wait");
        try {
            await expireDailyGame({ ...await getGameSession(sessionId, userId), daily_started_at: session.daily_started_at ?? new Date().toISOString() }, true);
            return (await getGameSession(sessionId, userId)).pp ?? null;
        } finally { await releaseSessionLock(lock); }
    }

    const lock = await acquireGameSessionLock(sessionId);
    if (!lock) throw new Error("Action in progress, please wait");

    try {
        const gameState = await getGameSession(sessionId, userId);
        if (!gameModeSchema.safeParse(gameState.game_mode).success) throw new Error("Game session not found or expired");
        return await finishGameSession(sessionId, userId, "quit");
    } finally {
        await releaseSessionLock(lock);
    }
}

export function getDailyChallengeInfo() {
    const now = new Date();
    return {
        day: getDailyChallengeDay(now, env.DEBUG_DAILY_DAY_OFFSET),
        serverNow: now.getTime(),
        resetAt: getNextDailyReset(now).getTime(),
        debugUnlimitedAttempts: env.DEBUG_DAILY_UNLIMITED_ATTEMPTS,
    };
}

export async function getDailyStatusForUser(userId: number, gameMode: GameMode) {
    gameMode = dailyGameModeSchema.parse(gameMode);
    const now = new Date();
    const dailyDate = getDailyDate(now, env.DEBUG_DAILY_DAY_OFFSET);
    const attempt = await prisma.dailyGameAttempt.findUnique({
        where: { userId_dailyDate_gameMode: { userId, dailyDate, gameMode } },
    });
    const day = getDailyChallengeDay(dailyDate);
    if (!attempt) return { attempted: false as const, resumable: false, scoreId: null, day };

    const game = await prisma.game.findUnique({ where: { sessionId: attempt.sessionId }, select: { id: true, runType: true, endReason: true, roundsPlayed: true } });
    const scoreId = game?.runType === "daily" && game.endReason === "completed" && game.roundsPlayed === DAILY_ROUNDS ? game.id.toString() : null;
    let resumable = false;
    if (!scoreId && !game) {
        try {
            const state = await getGameSession(attempt.sessionId, userId);
            resumable = state.is_active && !state.end_pending && state.run_type === "daily";
        } catch {}
    }
    return { attempted: true as const, resumable, scoreId, day };
}

export async function getSuggestions(str: string, gamemode: GameMode): Promise<string[]> {
    gamemode = gameModeSchema.parse(gamemode);
    if (!str || str.length < 2) return [];

    const needle = str.toLocaleLowerCase();
    const sortSuggestions = (values: string[]) =>
        values
            .sort((a, b) => {
                const normalizedA = a.toLocaleLowerCase();
                const normalizedB = b.toLocaleLowerCase();
                const prefixDifference = Number(!normalizedA.startsWith(needle)) - Number(!normalizedB.startsWith(needle));
                if (prefixDifference !== 0) return prefixDifference;
                const positionDifference = normalizedA.indexOf(needle) - normalizedB.indexOf(needle);
                return positionDifference !== 0 ? positionDifference : normalizedA.localeCompare(normalizedB);
            })
            .slice(0, 5);

    if (gamemode === GameMode.Skin) {
        const results = await prisma.skin.findMany({
            where: { name: { contains: str } },
            select: { name: true },
            distinct: ["name"],
        });
        return sortSuggestions(results.map(({ name }) => name));
    } else {
        const results = await prisma.mapsetData.findMany({
            where: { title: { contains: str } },
            select: { title: true },
            distinct: ["title"],
        });
        return sortSuggestions(results.flatMap(({ title }) => (title ? [title] : [])));
    }
}
