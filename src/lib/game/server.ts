import { prisma } from "@/lib/database/prisma";
import redisClient from "@/lib/redis";
import { z } from "zod";
import { MAX_ROUNDS, ROUND_TIME, SURVIVAL_LIVES, type GameVariant } from "@/app/games/config";
import { getRandomAudio, getRandomBackground, getRandomSkin } from "@/lib/game/mapsets";
import { GameMode, type MapsetDataWithTags, type GameState, type DatabaseGameSession, type GameEndReason, type PersistedGameRound, type SkinData } from "@/actions/types";
import { getMediaData } from "@/actions/media";
import { checkGuess, GuessDifficulty } from "@/lib/guess-checker";
import { calculateArcadeScore } from "@/lib/game/arcade-score";
import { isNoGameContentError } from "@/lib/game/content-errors";
import { canPersistGameResult } from "@/lib/game/completion";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";
import { calculateEmpiricalDifficulty, calculateProfilePp, calculateRunPp, type ContentPerformanceStats } from "@/lib/game/performance-points";
import { Prisma } from "@/generated/prisma/client";
import {
    acquireGameSessionLock,
    deleteGameSession,
    readOwnedGameSession,
    releaseGameSessionLock,
    writeGameSession,
} from "@/lib/game/session-storage";
import {
    getMultiplayerRoundState,
    getOrCreateMultiplayerRound,
    normalizeLobbyCode,
    readMultiplayerLobby,
    requireActiveMultiplayerLobby,
    updateMultiplayerProgress,
} from "@/lib/multiplayer";

const GRACE_PERIOD = 1;
const ROUND_TIME_MS = ROUND_TIME * 1000;
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

const gameSchema = z.object({
    sessionId: z.string().uuid(),
    guess: z
        .string()
        .max(200)
        .optional()
        .nullable()
        .transform((g) => (typeof g === "string" ? g.trim() : g)),
});
const gameModeSchema = z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin]);
const gameVariantSchema = z.enum(["classic", "survival"]);

type ContentStatRow = ContentPerformanceStats & {
    item_id: number;
};

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
    backgroundData?: string;
    audioData?: string;
    skinData?: string;
};

async function getGuessRoundItem(
    gameMode: GameMode,
    sessionId: string,
    lobbyCode?: string,
    round: number = 1,
    multiplayerMatchId?: string,
): Promise<GuessRoundItem> {
    if (!lobbyCode) {
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
    const data = await getOrCreateMultiplayerRound<MapsetDataWithTags | SkinData>(roundNamespace, round, async () => {
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
        return selected;
    });

    if (gameMode === GameMode.Audio && "audio_filename" in data) {
        return { data, audioData: await getMediaData(GameMode.Audio, data.audio_filename) };
    }
    if (gameMode === GameMode.Background && "image_filename" in data) {
        return { data, backgroundData: await getMediaData(GameMode.Background, data.image_filename) };
    }
    if (gameMode === GameMode.Skin && "image_filename" in data) {
        return { data, skinData: await getMediaData(GameMode.Skin, data.image_filename) };
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
    if (!session.is_active || session.end_pending) {
        throw new Error("Game session not found or expired");
    }
    return session;
}

function resolveEndReason(gameState: DatabaseGameSession, requestedReason?: GameEndReason): GameEndReason {
    if (gameState.end_reason) return gameState.end_reason;
    if (requestedReason === "quit" && gameState.variant === "classic" && gameState.current_round === MAX_ROUNDS && gameState.has_guessed_current_round) {
        return "completed";
    }
    if (requestedReason) return requestedReason;
    return gameState.variant === "classic" ? "completed" : "quit";
}

async function resolveRoundDifficulties(gameState: DatabaseGameSession, rounds: PersistedGameRound[]): Promise<PersistedGameRound[]> {
    if (rounds.length === 0) return rounds;

    const itemType = rounds[0].item_type;
    const itemIds = [...new Set(rounds.map((round) => round.item_id))];
    const rows = await prisma.contentStat.findMany({
        where: {
            gameMode: gameState.game_mode,
            itemType,
            rulesetVersion: gameState.ruleset_version ?? 0,
            ppVersion: gameState.pp_version ?? 0,
            itemId: { in: itemIds },
        },
        select: {
            itemId: true,
            appearances: true,
            correctCount: true,
            totalResponseTimeMs: true,
        },
    });
    const stats: ContentStatRow[] = rows.map((row) => ({
        item_id: row.itemId,
        appearances: Number(row.appearances),
        correct_count: Number(row.correctCount),
        total_response_time_ms: Number(row.totalResponseTimeMs),
    }));
    const contentStats = new Map(stats.map((row) => [row.item_id, row]));

    return rounds.map((round) => ({
        ...round,
        difficulty_snapshot: round.difficulty_snapshot ?? calculateEmpiricalDifficulty(contentStats.get(round.item_id)),
    }));
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
            MAX_ROUNDS,
        )
    ) {
        await writeGameSession({ ...pendingState, end_pending: false }, 120);
        if (gameState.multiplayer_lobby_id) {
            await updateMultiplayerProgress(gameState.multiplayer_lobby_id, userId, {
                points: gameState.total_points,
                round: gameState.current_round,
                finished: true,
            }, gameState.multiplayer_match_id ?? undefined).catch((error) => console.error("Failed to update multiplayer progress:", error));
        }
        return null;
    }

    const points = gameState.total_points;
    const recordedRounds = gameState.round_history ?? [];
    const roundHistory = await resolveRoundDifficulties(gameState, recordedRounds);
    const skipCount = roundHistory.filter((round) => round.result_type === "skip").length;
    const timeoutCount = roundHistory.filter((round) => round.result_type === "timeout").length;
    const totalResponseTimeMs = gameState.total_response_time_ms ?? roundHistory.reduce((total, round) => total + round.response_time_ms, 0);
    const rulesetVersion = gameState.ruleset_version ?? 0;
    const ppVersion = gameState.pp_version ?? 0;
    const ranked = gameState.ranked ?? true;
    const runPp = calculateRunPp(roundHistory, gameState.variant);
    const finalizingState = { ...pendingState, round_history: roundHistory, pp: runPp };
    await writeGameSession(finalizingState);

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
            const profilePp = calculateProfilePp(topRuns.map(({ pp }) => Number(pp)));

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

    await writeGameSession({ ...finalizingState, pp: persistedPp, end_pending: false }, 120);
    if (gameState.multiplayer_lobby_id) {
        await updateMultiplayerProgress(gameState.multiplayer_lobby_id, userId, {
            points,
            round: gameState.current_round,
            finished: true,
            completedMatch: endReason !== "quit",
        }, gameState.multiplayer_match_id ?? undefined).catch((error) => console.error("Failed to update multiplayer progress:", error));
    }
    return persistedPp;
}

export async function startGameForUser(userId: number, gameMode: GameMode, variant: GameVariant = "classic", multiplayerLobbyCode?: string): Promise<GameState> {
    gameMode = gameModeSchema.parse(gameMode);
    variant = gameVariantSchema.parse(variant);
    const lobbyCode = multiplayerLobbyCode ? normalizeLobbyCode(multiplayerLobbyCode) : undefined;
    const lobby = lobbyCode ? await requireActiveMultiplayerLobby(lobbyCode, userId, gameMode, variant) : null;
    const sessionId = crypto.randomUUID();

    const item = await getGuessRoundItem(gameMode, sessionId, lobbyCode, 1, lobby?.matchId);

    const itemId = gameMode === GameMode.Skin ? (item.data as SkinData).id : (item.data as MapsetDataWithTags).mapset_id;
    const itemType = gameMode === GameMode.Skin ? "skin" : "mapset";

    await Promise.all([deleteGameSession(sessionId), redisClient.del(`session_items:${sessionId}:mapset`), redisClient.del(`session_items:${sessionId}:skin`)]);

    const sessionItemsKey = `session_items:${sessionId}:${itemType}`;
    await redisClient.sAdd(sessionItemsKey, itemId.toString());
    await redisClient.expire(sessionItemsKey, 3600);

    const roundStartedAt = lobby?.startAt ?? Date.now();
    const startedAt = new Date(roundStartedAt).toISOString();
    const initialTimeLeft = lobby ? Math.max(0, Math.min(ROUND_TIME, ROUND_TIME - Math.floor((Date.now() - roundStartedAt) / 1000))) : ROUND_TIME;
    await writeGameSession({
        id: sessionId,
        user_id: userId,
        game_mode: gameMode,
        total_points: 0,
        current_streak: 0,
        highest_streak: 0,
        current_round: 1,
        current_item_id: itemId,
        time_left: ROUND_TIME,
        last_guess: null,
        last_guess_correct: null,
        last_points: null,
        correct_guesses: 0,
        total_time_used: 0,
        total_response_time_ms: 0,
        is_active: true,
        variant: variant,
        run_type: "standard",
        challenge_id: null,
        seed: null,
        config_snapshot: null,
        ranked: true,
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
        last_action_at: startedAt,
    });

    if (lobbyCode) {
        await updateMultiplayerProgress(lobbyCode, userId, { points: 0, round: 1, finished: false }, lobby!.matchId).catch((error) =>
            console.error("Failed to update multiplayer progress:", error),
        );
    }

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
            total: variant === "classic" ? MAX_ROUNDS : Infinity,
            correctGuesses: 0,
            totalTimeUsed: 0,
            mistakes: 0,
        },
        timeLeft: initialTimeLeft,
        gameStatus: "active",
        variant,
    };
}

export async function submitGuessForUser(userId: number, sessionId: string, guess?: string | null): Promise<GameState> {
    const validated = gameSchema.parse({ sessionId, guess });
    const lock = await acquireGameSessionLock(validated.sessionId);

    if (!lock) {
        throw new Error("Action in progress, please wait");
    }

    try {
        const gameState = await validateGameSession(validated.sessionId, userId);

        const submittedGuess = validated.guess;

        if (submittedGuess !== undefined && gameState.has_guessed_current_round) {
            throw new Error("Already submitted a guess for this round");
        }

        if (submittedGuess === undefined && !gameState.has_guessed_current_round) {
            throw new Error("You must make a guess, skip, or let the timer run out before advancing to the next round");
        }

        const isSurvivalMode = gameState.variant === "survival";
        const isContinuousMode = isSurvivalMode;

        if (!isContinuousMode && gameState.current_round > MAX_ROUNDS) {
            throw new Error("Game is complete");
        }

        const actionTimeMs = Date.now();
        const timeElapsedMs = gameState.has_guessed_current_round ? 0 : Math.max(0, actionTimeMs - new Date(gameState.last_action_at).getTime());
        const timeElapsed = Math.floor(timeElapsedMs / 1000);
        const rawTimeLeft = gameState.time_left - timeElapsed;
        const timeLeft = Math.max(0, rawTimeLeft);

        const guessingDifficulty: GuessDifficulty = 0.5;
        let isSkipped = submittedGuess === null;
        const isNextRound = submittedGuess === undefined;
        const isTimeout = submittedGuess === "";
        let effectiveGuess = isSkipped ? "" : submittedGuess;
        const isGuess = !isNextRound && !isTimeout;

        if (rawTimeLeft <= -GRACE_PERIOD && !isSkipped) {
            isSkipped = true;
            effectiveGuess = "";
        }

        let currentItem: MapsetDataWithTags | SkinData;
        if (gameState.game_mode === GameMode.Skin) {
            const skin = await prisma.skin.findUnique({ where: { id: gameState.current_item_id } });
            if (!skin) throw new Error("Current skin could not be resolved");
            currentItem = {
                id: skin.id,
                name: skin.name,
                image_filename: skin.imageFilename,
                created_at: skin.createdAt,
                updated_at: skin.updatedAt,
            };
        } else {
            const beatmap = await prisma.mapsetData.findUnique({ where: { mapsetId: gameState.current_item_id } });
            if (!beatmap) throw new Error("Current mapset could not be resolved");
            currentItem = {
                mapset_id: beatmap.mapsetId,
                title: beatmap.title ?? "",
                artist: beatmap.artist ?? "",
                mapper: beatmap.mapper ?? "",
                ranked_at: beatmap.rankedAt,
                star_rating_min: beatmap.starRatingMin == null ? null : Number(beatmap.starRatingMin),
                star_rating_max: beatmap.starRatingMax == null ? null : Number(beatmap.starRatingMax),
                image_filename: gameState.image_filename,
                audio_filename: gameState.audio_filename,
            };
        }

        const currentMedia: { backgroundData?: string; audioData?: string; skinData?: string } = {};
        if (gameState.game_mode === GameMode.Background) {
            currentMedia.backgroundData = await getMediaData(GameMode.Background, gameState.image_filename);
        } else if (gameState.game_mode === GameMode.Audio) {
            currentMedia.audioData = await getMediaData(GameMode.Audio, gameState.audio_filename);
        } else if (gameState.game_mode === GameMode.Skin) {
            currentMedia.skinData = await getMediaData(GameMode.Skin, gameState.image_filename);
        }

        const currentAnswer = gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).name : (currentItem as MapsetDataWithTags).title;

        const isCorrect = isGuess ? checkGuess(effectiveGuess || "", currentAnswer, guessingDifficulty) : false;
        const points = isNextRound ? 0 : calculateArcadeScore(isCorrect, timeLeft, gameState.current_streak);
        const madeMistake = !isNextRound && (isSkipped || isTimeout || (!isCorrect && isGuess));
        const existingMistakes = (gameState.round_history ?? []).filter((round) => !round.correct).length;
        const mistakes = existingMistakes + (madeMistake ? 1 : 0);
        const survivalFailed = isSurvivalMode && mistakes >= SURVIVAL_LIVES;
        const runFailed = survivalFailed;

        let nextBeatmap: { data: MapsetDataWithTags | SkinData; backgroundData?: string; audioData?: string; skinData?: string } | null = null;

        if (isNextRound) {
            if (gameState.multiplayer_lobby_id) {
                const multiplayerState = await getMultiplayerRoundState(
                    gameState.multiplayer_lobby_id,
                    userId,
                    gameState.current_round,
                );
                if (!multiplayerState.allReady) throw new Error("Waiting for other players");
            }

            try {
                nextBeatmap = await getGuessRoundItem(
                    gameState.game_mode,
                    validated.sessionId,
                    gameState.multiplayer_lobby_id ?? undefined,
                    gameState.current_round + 1,
                    gameState.multiplayer_match_id ?? undefined,
                );
            } catch (error) {
                if (!isContinuousMode || !isNoGameContentError(error)) throw error;
                const pp = await finishGameSession(sessionId, userId, "content_exhausted");
                return {
                    sessionId,
                    pp: pp ?? undefined,
                    currentBeatmap: {
                        imageUrl: gameState.game_mode === GameMode.Background ? currentMedia.backgroundData : gameState.game_mode === GameMode.Skin ? currentMedia.skinData : undefined,
                        audioUrl: gameState.game_mode === GameMode.Audio ? currentMedia.audioData : undefined,
                        revealed: true,
                        title: gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).name : (currentItem as MapsetDataWithTags).title,
                        artist: (currentItem as MapsetDataWithTags).artist,
                        mapper: (currentItem as MapsetDataWithTags).mapper,
                        mapsetId: gameState.current_item_id,
                    },
                    score: {
                        total: gameState.total_points,
                        current: 0,
                        streak: gameState.current_streak,
                        highestStreak: gameState.highest_streak,
                    },
                    rounds: {
                        current: gameState.current_round,
                        total: gameState.current_round,
                        correctGuesses: gameState.correct_guesses,
                        totalTimeUsed: gameState.total_time_used,
                        mistakes: existingMistakes,
                    },
                    timeLeft: 0,
                    gameStatus: "finished",
                    variant: gameState.variant,
                };
            }
        }

        const newStreak = isNextRound ? gameState.current_streak : isCorrect ? gameState.current_streak + 1 : 0;
        const resultType = isTimeout ? "timeout" : isSkipped ? "skip" : "guess";
        const currentMapset = gameState.game_mode === GameMode.Skin ? null : (currentItem as MapsetDataWithTags);
        const responseTimeMs = Math.min(timeElapsedMs, ROUND_TIME_MS);
        const roundRecord: PersistedGameRound | null = isNextRound
            ? null
            : {
                  round_number: gameState.current_round,
                  item_type: gameState.game_mode === GameMode.Skin ? "skin" : "mapset",
                  item_id: gameState.current_item_id,
                  submitted_guess: resultType === "guess" ? (effectiveGuess ?? "") : null,
                  answer_snapshot: currentAnswer,
                  result_type: resultType,
                  correct: isCorrect,
                  response_time_ms: responseTimeMs,
                  time_limit_ms: ROUND_TIME_MS,
                  points_earned: points,
                  streak_before: gameState.current_streak,
                  streak_after: newStreak,
                  difficulty_snapshot: null,
                  content_snapshot:
                      gameState.game_mode === GameMode.Skin
                          ? { name: (currentItem as SkinData).name }
                          : {
                                title: currentMapset?.title,
                                artist: currentMapset?.artist,
                                mapper: currentMapset?.mapper,
                                rankedAt: currentMapset?.ranked_at ?? null,
                                starRatingMin: currentMapset?.star_rating_min ?? null,
                                starRatingMax: currentMapset?.star_rating_max ?? null,
                            },
              };

        const updatedGameState = {
            ...gameState,
            total_points: gameState.total_points + points,
            current_streak: newStreak,
            highest_streak: Math.max(gameState.highest_streak, isCorrect ? gameState.current_streak + 1 : gameState.highest_streak),
            current_item_id: nextBeatmap ? ("mapset_id" in nextBeatmap.data ? nextBeatmap.data.mapset_id : nextBeatmap.data.id) : gameState.current_item_id,
            time_left: nextBeatmap ? ROUND_TIME : timeLeft,
            last_action_at: new Date().toISOString(),
            last_guess: isTimeout ? "TIMEOUT" : isSkipped ? "SKIPPED" : effectiveGuess,
            last_guess_correct: isCorrect ? 1 : 0,
            last_points: points,
            current_round: gameState.current_round + (isNextRound ? 1 : 0),
            correct_guesses: gameState.correct_guesses + (isCorrect ? 1 : 0),
            total_time_used: gameState.total_time_used + (!isNextRound ? ROUND_TIME - timeLeft : 0),
            total_response_time_ms: (gameState.total_response_time_ms ?? 0) + (roundRecord?.response_time_ms ?? 0),
            round_history: roundRecord ? [...(gameState.round_history ?? []), roundRecord] : (gameState.round_history ?? []),
            has_guessed_current_round: isNextRound ? false : true,
            ...(nextBeatmap && {
                title: "mapset_id" in nextBeatmap.data ? nextBeatmap.data.title : nextBeatmap.data.name,
                artist: (nextBeatmap.data as MapsetDataWithTags).artist,
                mapper: (nextBeatmap.data as MapsetDataWithTags).mapper,
                image_filename: "mapset_id" in nextBeatmap.data ? nextBeatmap.data.image_filename : nextBeatmap.data.image_filename,
                audio_filename: "mapset_id" in nextBeatmap.data ? nextBeatmap.data.audio_filename : null,
                has_guessed_current_round: false,
            }),
        };

        await writeGameSession(updatedGameState);

        if (gameState.multiplayer_lobby_id) {
            await updateMultiplayerProgress(gameState.multiplayer_lobby_id, userId, {
                points: updatedGameState.total_points,
                round: updatedGameState.current_round,
                ...(!isNextRound ? { submittedRound: gameState.current_round, resultRound: gameState.current_round, resultCorrect: isCorrect, resultSkipped: isSkipped, resultPoints: points } : {}),
                finished: runFailed,
            }, gameState.multiplayer_match_id ?? undefined).catch((error) => console.error("Failed to update multiplayer progress:", error));
        }

        if (isSurvivalMode && madeMistake && !survivalFailed) {
            const itemType = gameState.game_mode === GameMode.Skin ? "skin" : "mapset";
            await redisClient.sRem(`session_items:${sessionId}:${itemType}`, gameState.current_item_id.toString());
        }

        if (isNextRound && nextBeatmap) {
            const itemId = "mapset_id" in nextBeatmap.data ? nextBeatmap.data.mapset_id : nextBeatmap.data.id;
            const itemType = "mapset_id" in nextBeatmap.data ? "mapset" : "skin";
            const sessionItemsKey = `session_items:${sessionId}:${itemType}`;
            await redisClient.sAdd(sessionItemsKey, itemId.toString());
            await redisClient.expire(sessionItemsKey, 3600);
        }

        const pp = runFailed ? await finishGameSession(sessionId, userId, "failed") : null;

        return {
            sessionId,
            pp: pp ?? undefined,
            currentBeatmap: {
                imageUrl:
                    gameState.game_mode === GameMode.Background
                        ? (nextBeatmap?.backgroundData ?? currentMedia.backgroundData)
                        : gameState.game_mode === GameMode.Skin
                          ? (nextBeatmap?.skinData ?? currentMedia.skinData)
                          : undefined,
                audioUrl: gameState.game_mode === GameMode.Audio ? (nextBeatmap?.audioData ?? currentMedia.audioData) : undefined,
                revealed: !isNextRound,
                title: !isNextRound ? (gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).name : (currentItem as MapsetDataWithTags).title) : undefined,
                artist: !isNextRound ? (currentItem as MapsetDataWithTags).artist : undefined,
                mapper: !isNextRound ? (currentItem as MapsetDataWithTags).mapper : undefined,
                mapsetId: !isNextRound ? (gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).id : (currentItem as MapsetDataWithTags).mapset_id) : undefined,
            },
            score: {
                total: gameState.total_points + points,
                current: points,
                streak: newStreak,
                highestStreak: Math.max(gameState.highest_streak, isCorrect ? gameState.current_streak + 1 : gameState.highest_streak),
            },
            rounds: {
                current: gameState.current_round + (isNextRound ? 1 : 0),
                total: gameState.variant === "classic" ? MAX_ROUNDS : runFailed ? gameState.current_round : Infinity,
                correctGuesses: gameState.correct_guesses + (isCorrect ? 1 : 0),
                totalTimeUsed: gameState.total_time_used + (!isNextRound ? ROUND_TIME - timeLeft : 0),
                mistakes,
            },
            timeLeft: runFailed ? 0 : nextBeatmap ? ROUND_TIME : timeLeft,
            gameStatus: runFailed ? "finished" : "active",
            variant: gameState.variant as GameVariant,
            lastGuess: !isNextRound
                ? {
                      correct: isCorrect,
                      answer: currentAnswer,
                      type: isTimeout ? "timeout" : isSkipped ? "skip" : "guess",
                  }
                : undefined,
        };
    } finally {
        await releaseSessionLock(lock);
    }
}

export async function getGameStateForUser(userId: number, sessionId: string): Promise<GameState> {
    sessionId = z.string().uuid().parse(sessionId);

    let gameState = await getGameSession(sessionId, userId);
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

    const timeElapsed = gameState.has_guessed_current_round ? 0 : Math.floor((Date.now() - new Date(gameState.last_action_at).getTime()) / 1000);
    const timeLeft = Math.max(0, gameState.time_left - timeElapsed);

    let mediaData: string | undefined;
    if (gameState.game_mode === GameMode.Background) {
        mediaData = await getMediaData(GameMode.Background, gameState.image_filename);
    } else if (gameState.game_mode === GameMode.Audio) {
        mediaData = await getMediaData(GameMode.Audio, gameState.audio_filename);
    } else if (gameState.game_mode === GameMode.Skin) {
        mediaData = await getMediaData(GameMode.Skin, gameState.image_filename);
    }

    return {
        sessionId,
        pp: gameState.pp,
        currentBeatmap: {
            imageUrl: gameState.game_mode === GameMode.Background ? mediaData : gameState.game_mode === GameMode.Skin ? mediaData : undefined,
            audioUrl: gameState.game_mode === GameMode.Audio ? mediaData : undefined,
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
            total: gameState.variant === "classic" ? MAX_ROUNDS : Infinity,
            correctGuesses: gameState.correct_guesses,
            totalTimeUsed: gameState.total_time_used,
            mistakes: (gameState.round_history ?? []).filter((round) => !round.correct).length,
        },
        timeLeft,
        gameStatus: gameState.is_active ? "active" : "finished",
        variant: gameState.variant as GameVariant,
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
    const lock = await acquireGameSessionLock(sessionId);
    if (!lock) throw new Error("Action in progress, please wait");

    try {
        return await finishGameSession(sessionId, userId, "quit");
    } finally {
        await releaseSessionLock(lock);
    }
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
