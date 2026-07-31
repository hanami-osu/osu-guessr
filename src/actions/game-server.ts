"use server";

import { getAuthSession } from "./server";
import { query } from "@/lib/database";
import redisClient from "@/lib/redis";
import { z } from "zod";
import { BASE_POINTS, STREAK_BONUS, TIME_BONUS_MULTIPLIER, MAX_ROUNDS, ROUND_TIME, GameVariant } from "../app/games/config";
import { getRandomAudioAction, getRandomBackgroundAction, getRandomSkinAction } from "./mapsets-server";
import { GameMode, type MapsetDataWithTags, type GameState, type DatabaseGameSession, type SkinData } from "./types";
import { getMediaData } from "./media";
import { checkGuess, GuessDifficulty } from "@/lib/guess-checker";
import { isNoGameContentError } from "@/lib/game/content-errors";

const GRACE_PERIOD = 1;
const SESSION_LOCK_TTL_MS = 5000;
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
        .transform((g) => g?.trim()),
});

// const rateLimits = new Map<string, number>();
// const RATE_LIMIT_WINDOW = 1000;

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

async function validateGameSession(sessionId: string, userId: number): Promise<DatabaseGameSession> {
    const cacheKey = `game_session:${sessionId}`;
    const cached = await redisClient.get(cacheKey);
    if (!cached) {
        throw new Error("Game session not found or expired");
    }
    const session = JSON.parse(cached) as DatabaseGameSession;
    if (session.user_id !== userId || !session.is_active) {
        throw new Error("Game session not found or expired");
    }
    return session;
}

export async function startGameAction(gameMode: GameMode, variant: GameVariant = "classic"): Promise<GameState> {
    const authSession = await getAuthSession();
    const sessionId = crypto.randomUUID();

    try {
        const item = gameMode === GameMode.Audio ? await getRandomAudioAction(sessionId) : gameMode === GameMode.Background ? await getRandomBackgroundAction(sessionId) : await getRandomSkinAction(sessionId);

        const itemId = gameMode === GameMode.Skin ? (item.data as SkinData).id : (item.data as MapsetDataWithTags).mapset_id;
        const itemType = gameMode === GameMode.Skin ? "skin" : "mapset";

        const sessKey = `game_session:${sessionId}`;
        await Promise.all([redisClient.del(sessKey), redisClient.del(`session_items:${sessionId}:mapset`), redisClient.del(`session_items:${sessionId}:skin`)]);

        const sessionItemsKey = `session_items:${sessionId}:${itemType}`;
        await redisClient.sAdd(sessionItemsKey, itemId.toString());
        await redisClient.expire(sessionItemsKey, 3600);

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
                last_action_at: new Date().toISOString(),
                last_guess: null,
                last_guess_correct: null,
                last_points: null,
                correct_guesses: 0,
                total_time_used: 0,
                is_active: true,
                variant: variant,
                title: "mapset_id" in item.data ? (item.data as MapsetDataWithTags).title : (item.data as SkinData).name,
                artist: (item.data as MapsetDataWithTags).artist,
                mapper: (item.data as MapsetDataWithTags).mapper,
                image_filename: "mapset_id" in item.data ? (item.data as MapsetDataWithTags).image_filename : (item.data as SkinData).image_filename,
                audio_filename: "mapset_id" in item.data ? (item.data as MapsetDataWithTags).audio_filename : null,
                has_guessed_current_round: false,
            }),
            { EX: 3600 }, // Expire session after 1 hour
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
    } catch (error) {
        throw error;
    }
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

        if (guess !== undefined && gameState.has_guessed_current_round) {
            throw new Error("Already submitted a guess for this round");
        }

        if (guess === undefined && !gameState.has_guessed_current_round) {
            throw new Error("You must make a guess, skip, or let the timer run out before advancing to the next round");
        }

        const isDeathMode = gameState.variant === "death";

        if (!isDeathMode && gameState.current_round > MAX_ROUNDS) {
            throw new Error("Game is complete");
        }

        const timeElapsed = Math.floor((Date.now() - new Date(gameState.last_action_at).getTime()) / 1000);
        const rawTimeLeft = gameState.time_left - timeElapsed;
        const timeLeft = Math.max(0, rawTimeLeft);

        const guessingDifficulty: GuessDifficulty = 0.5;
        let isSkipped = guess === null;
        const isNextRound = guess === undefined;
        const isTimeout = guess === "";
        let effectiveGuess = isSkipped ? "" : guess;
        const isGuess = !isNextRound && !isTimeout;

        if (rawTimeLeft <= -GRACE_PERIOD && !isSkipped) {
            isSkipped = true;
            effectiveGuess = "";
        }

        // Get current item data based on game mode
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

        // Get the answer based on game mode
        const currentAnswer = gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).name : (currentItem as MapsetDataWithTags).title;

        const isCorrect = isGuess ? checkGuess(effectiveGuess || "", currentAnswer, guessingDifficulty) : false;
        const points = isNextRound ? 0 : calculateScore(isCorrect, timeLeft, gameState.current_streak);
        // In death mode, if correct guess, check for remaining beatmaps; finish game if none left
        if (isDeathMode && isGuess && isCorrect) {
            try {
                if (gameState.game_mode === GameMode.Audio) {
                    await getRandomAudioAction(validated.sessionId);
                } else if (gameState.game_mode === GameMode.Background) {
                    await getRandomBackgroundAction(validated.sessionId);
                } else if (gameState.game_mode === GameMode.Skin) {
                    await getRandomSkinAction(validated.sessionId);
                }
            } catch (error) {
                if (!isNoGameContentError(error)) throw error;

                // No more beatmaps: end game and return finished state
                const newStreak = gameState.current_streak + 1;
                const newHighest = Math.max(gameState.highest_streak, newStreak);
                const newCorrects = gameState.correct_guesses + 1;
                const newTimeUsed = gameState.total_time_used + (ROUND_TIME - timeLeft);
                await endGameAction(sessionId);
                return {
                    sessionId,
                    currentBeatmap: {
                        imageUrl: gameState.game_mode === GameMode.Background ? currentMedia.backgroundData : gameState.game_mode === GameMode.Skin ? currentMedia.skinData : undefined,
                        audioUrl: gameState.game_mode === GameMode.Audio ? currentMedia.audioData : undefined,
                        revealed: true,
                        title: gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).name : (currentItem as MapsetDataWithTags).title,
                        artist: (currentItem as MapsetDataWithTags).artist,
                        mapper: (currentItem as MapsetDataWithTags).mapper,
                        mapsetId: gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).id : (currentItem as MapsetDataWithTags).mapset_id,
                    },
                    score: {
                        total: gameState.total_points + points,
                        current: points,
                        streak: newStreak,
                        highestStreak: newHighest,
                    },
                    rounds: {
                        current: gameState.current_round,
                        total: gameState.current_round,
                        correctGuesses: newCorrects,
                        totalTimeUsed: newTimeUsed,
                    },
                    timeLeft: 0,
                    gameStatus: "finished",
                    variant: "death",
                    lastGuess: {
                        correct: true,
                        answer: currentAnswer,
                        type: "guess",
                    },
                };
            }
        }

        if (isDeathMode && (isSkipped || isTimeout || (!isCorrect && isGuess))) {
            await endGameAction(sessionId);
            return {
                sessionId,
                currentBeatmap: {
                    imageUrl: gameState.game_mode === GameMode.Background ? currentMedia.backgroundData : gameState.game_mode === GameMode.Skin ? currentMedia.skinData : undefined,
                    audioUrl: gameState.game_mode === GameMode.Audio ? currentMedia.audioData : undefined,
                    revealed: true,
                    title: gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).name : (currentItem as MapsetDataWithTags).title,
                    artist: (currentItem as MapsetDataWithTags).artist,
                    mapper: (currentItem as MapsetDataWithTags).mapper,
                    mapsetId: gameState.game_mode === GameMode.Skin ? (currentItem as SkinData).id : (currentItem as MapsetDataWithTags).mapset_id,
                },
                score: {
                    total: gameState.total_points,
                    current: 0,
                    streak: 0,
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
                variant: "death",
                lastGuess: !isNextRound
                    ? {
                          correct: isCorrect,
                          answer: currentAnswer,
                          type: isTimeout ? "timeout" : isSkipped ? "skip" : "guess",
                      }
                    : undefined,
            };
        }

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

                if (isDeathMode && !nextBeatmap) {
                    await endGameAction(sessionId);
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
            } catch (error) {
                if (!isDeathMode || !isNoGameContentError(error)) throw error;
                await endGameAction(sessionId);
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

        const updatedGameState = {
            ...gameState,
            total_points: gameState.total_points + points,
            current_streak: newStreak,
            highest_streak: Math.max(gameState.highest_streak, isCorrect ? gameState.current_streak + 1 : gameState.highest_streak),
            current_item_id: nextBeatmap ? ("mapset_id" in nextBeatmap.data ? nextBeatmap.data.mapset_id : nextBeatmap.data.id) : gameState.current_item_id,
            time_left: nextBeatmap ? ROUND_TIME : gameState.time_left,
            last_action_at: new Date().toISOString(),
            last_guess: isTimeout ? "TIMEOUT" : isSkipped ? "SKIPPED" : effectiveGuess,
            last_guess_correct: isCorrect ? 1 : 0,
            last_points: points,
            current_round: gameState.current_round + (isNextRound ? 1 : 0),
            correct_guesses: gameState.correct_guesses + (isCorrect ? 1 : 0),
            total_time_used: gameState.total_time_used + (isNextRound ? ROUND_TIME - timeLeft : 0),
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
                total: gameState.variant === "classic" ? MAX_ROUNDS : Infinity,
                correctGuesses: gameState.correct_guesses + (isCorrect ? 1 : 0),
                totalTimeUsed: gameState.total_time_used + (isNextRound ? ROUND_TIME - timeLeft : 0),
            },
            timeLeft: nextBeatmap ? ROUND_TIME : gameState.time_left,
            gameStatus: "active",
            variant: gameState.variant as GameVariant,
            lastGuess: !isNextRound
                ? {
                      correct: isCorrect,
                      answer: currentAnswer,
                      type: isTimeout ? "timeout" : isSkipped ? "skip" : "guess",
                  }
                : undefined,
        };
    } catch (error) {
        throw error;
    } finally {
        await releaseSessionLock(lock);
    }
}

export async function getGameStateAction(sessionId: string): Promise<GameState> {
    const authSession = await getAuthSession();

    try {
        const gameState = await validateGameSession(sessionId, authSession.user.banchoId);

        const timeElapsed = Math.floor((Date.now() - new Date(gameState.last_action_at).getTime()) / 1000);
        const timeLeft = Math.max(0, gameState.time_left - timeElapsed);

        if (timeLeft !== gameState.time_left) {
            const updatedGameState = { ...gameState, time_left: timeLeft };
            const sessKey = `game_session:${sessionId}`;
            await redisClient.set(sessKey, JSON.stringify(updatedGameState), { EX: 3600 });
        }

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
    } catch (error) {
        throw error;
    }
}

export async function endGameAction(sessionId: string): Promise<void> {
    console.log("Ending game for:", sessionId);
    const authSession = await getAuthSession();

    try {
        const cacheKey = `game_session:${sessionId}`;
        const cached = await redisClient.get(cacheKey);
        if (!cached) {
            console.log("Game session not found, already ended or expired:", sessionId);
            return;
        }

        const gameState = JSON.parse(cached) as DatabaseGameSession;
        if (gameState.user_id !== authSession.user.banchoId) {
            throw new Error("Game session not found or expired");
        }

        if (!gameState.is_active) {
            console.log("Game session already ended:", sessionId);
            return;
        }

        const updatedGameState = { ...gameState, is_active: false };
        const sessKey = `game_session:${sessionId}`;
        await redisClient.set(sessKey, JSON.stringify(updatedGameState), { EX: 120 });

        if (gameState.variant === "classic" && gameState.current_round < MAX_ROUNDS) {
            return;
        }

        const points = gameState.variant === "death" ? 0 : gameState.total_points;

        await query(
            `INSERT INTO games (user_id, game_mode, points, streak, variant)
                VALUES (?, ?, ?, ?, ?)`,
            [authSession.user.banchoId, gameState.game_mode, points, gameState.highest_streak, gameState.variant],
        );

        if (gameState.variant === "classic") {
            await query(
                `INSERT INTO user_achievements
                 (user_id, game_mode, total_score, games_played, highest_streak, highest_score)
                 VALUES (?, ?, ?, 1, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   total_score = total_score + VALUES(total_score),
                   games_played = games_played + 1,
                   highest_streak = GREATEST(highest_streak, VALUES(highest_streak)),
                   highest_score = GREATEST(highest_score, VALUES(highest_score)),
                   last_played = CURRENT_TIMESTAMP`,
                [authSession.user.banchoId, gameState.game_mode, points, gameState.highest_streak, points],
            );
        } else {
            await query(
                `INSERT INTO user_achievements
                 (user_id, game_mode, total_score, games_played, highest_streak, highest_score)
                 VALUES (?, ?, 0, 1, ?, 0)
                 ON DUPLICATE KEY UPDATE
                   games_played = games_played + 1,
                   highest_streak = GREATEST(highest_streak, VALUES(highest_streak)),
                   last_played = CURRENT_TIMESTAMP`,
                [authSession.user.banchoId, gameState.game_mode, gameState.highest_streak],
            );
        }
    } catch (error) {
        throw error;
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

    if (!isCorrect) return -50;
    return BASE_POINTS + timeLeft * TIME_BONUS_MULTIPLIER + streak * STREAK_BONUS;
}
