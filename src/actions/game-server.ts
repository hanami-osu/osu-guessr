"use server";

import { getAuthSession } from "./server";
import { query, transaction } from "@/lib/database";
import redisClient from "@/lib/redis";
import { z } from "zod";
import { BASE_POINTS, STREAK_BONUS, TIME_BONUS_MULTIPLIER, MAX_ROUNDS, ROUND_TIME, SKIP_PENALTY, type GameVariant } from "../app/games/config";
import { getRandomAudioAction, getRandomBackgroundAction, getRandomSkinAction } from "./mapsets-server";
import { GameMode, type MapsetDataWithTags, type GameState, type DatabaseGameSession, type GameEndReason, type PersistedGameRound, type SkinData } from "./types";
import { getMediaData } from "./media";
import { checkGuess, GuessDifficulty } from "@/lib/guess-checker";
import { isNoGameContentError } from "@/lib/game/content-errors";
import { canPersistGameResult } from "@/lib/game/completion";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";

const GRACE_PERIOD = 1;
const SESSION_LOCK_TTL_MS = 30_000;
const ROUND_TIME_MS = ROUND_TIME * 1000;
const RELEASE_SESSION_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
`;

const gameSchema = z.object({
    sessionId: z.string().uuid(),
    guess: z
        .string()
        .max(200)
        .optional()
        .nullable()
        .transform((g) => (typeof g === "string" ? g.trim() : g)),
});
const gameModeSchema = z.nativeEnum(GameMode);
const gameVariantSchema = z.enum(["classic", "death"]);

type SessionLock = {
    key: string;
    token: string;
};

async function acquireSessionLock(sessionId: string, timeoutMs: number = SESSION_LOCK_TTL_MS): Promise<SessionLock | null> {
    const key = `game_session_lock:${sessionId}`;
    const token = crypto.randomUUID();
    const result = await redisClient.set(key, token, {
        condition: "NX",
        expiration: {
            type: "PX",
            value: timeoutMs,
        },
    });

    return result === "OK" ? { key, token } : null;
}

async function releaseSessionLock(lock: SessionLock): Promise<void> {
    try {
        await redisClient.eval(RELEASE_SESSION_LOCK_SCRIPT, {
            keys: [lock.key],
            arguments: [lock.token],
        });
    } catch (error) {
        console.error("Failed to release game session lock:", error);
    }
}

async function getGameSession(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const cacheKey = `game_session:${sessionId}`;
    const cached = await redisClient.get(cacheKey);
    if (!cached) {
        throw new Error("Game session not found or expired");
    }
    const session = JSON.parse(cached) as DatabaseGameSession;
    if (session.user_id !== userId) {
        throw new Error("Game session not found or expired");
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

async function finishGameSession(sessionId: string, userId: number, requestedReason?: GameEndReason): Promise<void> {
    const cacheKey = `game_session:${sessionId}`;
    const gameState = await getGameSession(sessionId, userId);
    if (!gameState.is_active && !gameState.end_pending) return;

    const endReason = resolveEndReason(gameState, requestedReason);
    const pendingState = { ...gameState, is_active: false, end_pending: true, end_reason: endReason };
    await redisClient.set(cacheKey, JSON.stringify(pendingState), { EX: 3600 });

    if (!canPersistGameResult({ variant: gameState.variant, currentRound: gameState.current_round, hasGuessedCurrentRound: gameState.has_guessed_current_round }, MAX_ROUNDS)) {
        await redisClient.set(cacheKey, JSON.stringify({ ...pendingState, end_pending: false }), { EX: 120 });
        return;
    }

    const points = gameState.variant === "death" ? 0 : gameState.total_points;
    const roundHistory = gameState.round_history ?? [];
    const skipCount = roundHistory.filter((round) => round.result_type === "skip").length;
    const timeoutCount = roundHistory.filter((round) => round.result_type === "timeout").length;
    const totalResponseTimeMs = gameState.total_response_time_ms ?? roundHistory.reduce((total, round) => total + round.response_time_ms, 0);
    const rulesetVersion = gameState.ruleset_version ?? 0;
    const ppVersion = gameState.pp_version ?? 0;

    await transaction(async (query) => {
        await query(
            `INSERT IGNORE INTO games
             (session_id, user_id, game_mode, points, streak, variant, run_type, challenge_id, seed, config_snapshot,
              ranked, ruleset_version, pp_version, pp, rounds_played, correct_count, skip_count, timeout_count,
              total_response_time_ms, started_at, ended_at, end_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), ?)`,
            [
                sessionId,
                userId,
                gameState.game_mode,
                points,
                gameState.highest_streak,
                gameState.variant,
                gameState.run_type ?? "standard",
                gameState.challenge_id ?? null,
                gameState.seed ?? null,
                gameState.config_snapshot ? JSON.stringify(gameState.config_snapshot) : null,
                gameState.ranked ?? true,
                rulesetVersion,
                ppVersion,
                roundHistory.length,
                gameState.correct_guesses,
                skipCount,
                timeoutCount,
                totalResponseTimeMs,
                gameState.started_at ?? new Date().toISOString(),
                endReason,
            ],
        );
        const [{ inserted }] = await query<{ inserted: number }>("SELECT ROW_COUNT() AS inserted");
        if (inserted === 1) {
            const [persistedGame] = await query<{ id: bigint }>("SELECT id FROM games WHERE session_id = ? LIMIT 1", [sessionId]);
            if (!persistedGame) throw new Error("Persisted game could not be resolved");

            for (const round of roundHistory) {
                await query(
                    `INSERT INTO game_rounds
                     (game_id, round_number, item_type, item_id, submitted_guess, answer_snapshot, result_type, correct,
                      response_time_ms, time_limit_ms, points_earned, streak_before, streak_after, difficulty_snapshot, content_snapshot)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        persistedGame.id,
                        round.round_number,
                        round.item_type,
                        round.item_id,
                        round.submitted_guess,
                        round.answer_snapshot,
                        round.result_type,
                        round.correct,
                        round.response_time_ms,
                        round.time_limit_ms,
                        round.points_earned,
                        round.streak_before,
                        round.streak_after,
                        round.difficulty_snapshot,
                        round.content_snapshot ? JSON.stringify(round.content_snapshot) : null,
                    ],
                );

                await query(
                    `INSERT INTO content_stats
                     (game_mode, item_type, item_id, ruleset_version, pp_version, appearances, correct_count, skip_count,
                      timeout_count, total_response_time_ms, fastest_correct_ms)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       appearances = appearances + 1,
                       correct_count = correct_count + VALUES(correct_count),
                       skip_count = skip_count + VALUES(skip_count),
                       timeout_count = timeout_count + VALUES(timeout_count),
                       total_response_time_ms = total_response_time_ms + VALUES(total_response_time_ms),
                       fastest_correct_ms = CASE
                           WHEN VALUES(fastest_correct_ms) IS NULL THEN fastest_correct_ms
                           WHEN fastest_correct_ms IS NULL THEN VALUES(fastest_correct_ms)
                           ELSE LEAST(fastest_correct_ms, VALUES(fastest_correct_ms))
                       END`,
                    [
                        gameState.game_mode,
                        round.item_type,
                        round.item_id,
                        rulesetVersion,
                        ppVersion,
                        round.correct ? 1 : 0,
                        round.result_type === "skip" ? 1 : 0,
                        round.result_type === "timeout" ? 1 : 0,
                        round.response_time_ms,
                        round.correct ? round.response_time_ms : null,
                    ],
                );
            }

            await query(
                `INSERT INTO user_achievements
                 (user_id, game_mode, variant, ruleset_version, pp_version, total_score, games_played, rounds_played,
                  total_correct, total_skips, total_timeouts, total_response_time_ms, highest_streak, highest_score, best_run_pp, profile_pp)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 0, 0)
                 ON DUPLICATE KEY UPDATE
                   total_score = total_score + VALUES(total_score),
                   games_played = games_played + 1,
                   rounds_played = rounds_played + VALUES(rounds_played),
                   total_correct = total_correct + VALUES(total_correct),
                   total_skips = total_skips + VALUES(total_skips),
                   total_timeouts = total_timeouts + VALUES(total_timeouts),
                   total_response_time_ms = total_response_time_ms + VALUES(total_response_time_ms),
                   highest_streak = GREATEST(highest_streak, VALUES(highest_streak)),
                   highest_score = GREATEST(highest_score, VALUES(highest_score)),
                   best_run_pp = GREATEST(best_run_pp, VALUES(best_run_pp)),
                   profile_pp = VALUES(profile_pp),
                   last_played = CURRENT_TIMESTAMP(3)`,
                [
                    userId,
                    gameState.game_mode,
                    gameState.variant,
                    rulesetVersion,
                    ppVersion,
                    points,
                    roundHistory.length,
                    gameState.correct_guesses,
                    skipCount,
                    timeoutCount,
                    totalResponseTimeMs,
                    gameState.highest_streak,
                    points,
                ],
            );
        }
    });

    await redisClient.set(cacheKey, JSON.stringify({ ...pendingState, end_pending: false }), { EX: 120 });
}

export async function startGameAction(gameMode: GameMode, variant: GameVariant = "classic"): Promise<GameState> {
    gameMode = gameModeSchema.parse(gameMode);
    variant = gameVariantSchema.parse(variant);
    const authSession = await getAuthSession();
    const sessionId = crypto.randomUUID();

    const item = gameMode === GameMode.Audio ? await getRandomAudioAction(sessionId) : gameMode === GameMode.Background ? await getRandomBackgroundAction(sessionId) : await getRandomSkinAction(sessionId);

    const itemId = gameMode === GameMode.Skin ? (item.data as SkinData).id : (item.data as MapsetDataWithTags).mapset_id;
    const itemType = gameMode === GameMode.Skin ? "skin" : "mapset";

    const sessKey = `game_session:${sessionId}`;
    await Promise.all([redisClient.del(sessKey), redisClient.del(`session_items:${sessionId}:mapset`), redisClient.del(`session_items:${sessionId}:skin`)]);

    const sessionItemsKey = `session_items:${sessionId}:${itemType}`;
    await redisClient.sAdd(sessionItemsKey, itemId.toString());
    await redisClient.expire(sessionItemsKey, 3600);

    const startedAt = new Date().toISOString();
    await redisClient.set(
        sessKey,
        JSON.stringify({
            id: sessionId,
            user_id: authSession.user.banchoId,
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
            last_action_at: startedAt,
        }),
        { EX: 3600 },
    );

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
            total: MAX_ROUNDS,
            correctGuesses: 0,
            totalTimeUsed: 0,
        },
        timeLeft: ROUND_TIME,
        gameStatus: "active",
        variant,
    };
}

export async function submitGuessAction(sessionId: string, guess?: string | null): Promise<GameState> {
    const authSession = await getAuthSession();
    const validated = gameSchema.parse({ sessionId, guess });
    const lock = await acquireSessionLock(validated.sessionId);

    if (!lock) {
        throw new Error("Action in progress, please wait");
    }

    try {
        const gameState = await validateGameSession(validated.sessionId, authSession.user.banchoId);

        const submittedGuess = validated.guess;

        if (submittedGuess !== undefined && gameState.has_guessed_current_round) {
            throw new Error("Already submitted a guess for this round");
        }

        if (submittedGuess === undefined && !gameState.has_guessed_current_round) {
            throw new Error("You must make a guess, skip, or let the timer run out before advancing to the next round");
        }

        const isDeathMode = gameState.variant === "death";

        if (!isDeathMode && gameState.current_round > MAX_ROUNDS) {
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
            const [skin]: Array<SkinData> = await query(`SELECT * FROM skins WHERE id = ?`, [gameState.current_item_id]);
            currentItem = skin;
        } else {
            const [beatmap]: Array<MapsetDataWithTags> = await query(`SELECT * FROM mapset_data WHERE mapset_id = ?`, [gameState.current_item_id]);
            currentItem = beatmap;
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
        const points = isNextRound || isDeathMode ? 0 : calculateScore(isCorrect, timeLeft, gameState.current_streak);
        const deathFailed = isDeathMode && (isSkipped || isTimeout || (!isCorrect && isGuess));

        let nextBeatmap: { data: MapsetDataWithTags | SkinData; backgroundData?: string; audioData?: string; skinData?: string } | null = null;

        if (isNextRound) {
            try {
                if (gameState.game_mode === GameMode.Audio) {
                    const audio = await getRandomAudioAction(validated.sessionId);
                    nextBeatmap = { data: audio.data, audioData: audio.audioData };
                } else if (gameState.game_mode === GameMode.Background) {
                    const background = await getRandomBackgroundAction(validated.sessionId);
                    nextBeatmap = { data: background.data, backgroundData: background.backgroundData };
                } else if (gameState.game_mode === GameMode.Skin) {
                    const skin = await getRandomSkinAction(validated.sessionId);
                    nextBeatmap = { data: skin.data, skinData: skin.skinData };
                }
            } catch (error) {
                if (!isDeathMode || !isNoGameContentError(error)) throw error;
                await finishGameSession(sessionId, authSession.user.banchoId, "content_exhausted");
                return {
                    sessionId,
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
        const difficultySnapshot = currentMapset?.star_rating_max == null ? null : Number(currentMapset.star_rating_max);
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
                  difficulty_snapshot: Number.isFinite(difficultySnapshot) ? difficultySnapshot : null,
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

        const sessKey = `game_session:${sessionId}`;
        await redisClient.set(sessKey, JSON.stringify(updatedGameState), { EX: 3600 });

        if (isNextRound && nextBeatmap) {
            const itemId = "mapset_id" in nextBeatmap.data ? nextBeatmap.data.mapset_id : nextBeatmap.data.id;
            const itemType = "mapset_id" in nextBeatmap.data ? "mapset" : "skin";
            const sessionItemsKey = `session_items:${sessionId}:${itemType}`;
            await redisClient.sAdd(sessionItemsKey, itemId.toString());
            await redisClient.expire(sessionItemsKey, 3600);
        }

        if (deathFailed) {
            await finishGameSession(sessionId, authSession.user.banchoId, "failed");
        }

        return {
            sessionId,
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
                total: gameState.variant === "classic" ? MAX_ROUNDS : deathFailed ? gameState.current_round : Infinity,
                correctGuesses: gameState.correct_guesses + (isCorrect ? 1 : 0),
                totalTimeUsed: gameState.total_time_used + (!isNextRound ? ROUND_TIME - timeLeft : 0),
            },
            timeLeft: deathFailed ? 0 : nextBeatmap ? ROUND_TIME : timeLeft,
            gameStatus: deathFailed ? "finished" : "active",
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

export async function getGameStateAction(sessionId: string): Promise<GameState> {
    sessionId = z.string().uuid().parse(sessionId);
    const authSession = await getAuthSession();

    let gameState = await getGameSession(sessionId, authSession.user.banchoId);
    if (gameState.end_pending) {
        const lock = await acquireSessionLock(sessionId);
        if (!lock) throw new Error("Action in progress, please wait");

        try {
            await finishGameSession(sessionId, authSession.user.banchoId);
            gameState = await getGameSession(sessionId, authSession.user.banchoId);
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

export async function endGameAction(sessionId: string): Promise<void> {
    sessionId = z.string().uuid().parse(sessionId);
    const authSession = await getAuthSession();
    const lock = await acquireSessionLock(sessionId);
    if (!lock) throw new Error("Action in progress, please wait");

    try {
        await finishGameSession(sessionId, authSession.user.banchoId, "quit");
    } finally {
        await releaseSessionLock(lock);
    }
}

export async function getSuggestionsAction(str: string, gamemode: GameMode): Promise<string[]> {
    if (!str || str.length < 2) return [];

    if (gamemode === GameMode.Skin) {
        const queryStr = `SELECT DISTINCT name AS title
                          FROM skins
                          WHERE LOWER(name) LIKE CONCAT('%', LOWER(?), '%')
                          ORDER BY (LOWER(name) LIKE CONCAT(LOWER(?), '%')) DESC, LOCATE(LOWER(?), LOWER(name)) ASC
                          LIMIT 5;`;
        const results: Array<{ title: string }> = await query(queryStr, [str, str, str]);
        return results.map((r) => r.title);
    } else {
        const queryStr = `SELECT DISTINCT title
                          FROM mapset_data
                          WHERE LOWER(title) LIKE CONCAT('%', LOWER(?), '%')
                          ORDER BY (LOWER(title) LIKE CONCAT(LOWER(?), '%')) DESC, LOCATE(LOWER(?), LOWER(title)) ASC
                          LIMIT 5;`;
        const results: Array<{ title: string }> = await query(queryStr, [str, str, str]);
        return results.map((r) => r.title);
    }
}

function calculateScore(isCorrect: boolean, timeLeft: number, streak: number): number {
    timeLeft = Number(timeLeft) || 0;
    streak = Number(streak) || 0;

    if (!isCorrect) return -SKIP_PENALTY;
    return BASE_POINTS + timeLeft * TIME_BONUS_MULTIPLIER + streak * STREAK_BONUS;
}
