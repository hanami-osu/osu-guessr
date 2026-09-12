import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { GameMode, type DatabaseGameSession } from "./types";
import { NoGameContentError } from "@/lib/game/content-errors";

const sessionId = "00000000-0000-4000-8000-000000000000";
const userId = 123;
const answer = "Test Map";

const contentStatFindManyMock = mock(async () => [] as Array<{ itemId: number; appearances: bigint; correctCount: bigint; totalResponseTimeMs: bigint }>);
const contentStatFindUniqueMock = mock(async () => null as { appearances: bigint; correctCount: bigint; totalResponseTimeMs: bigint; fastestCorrectMs: number | null } | null);
const contentStatUpsertMock = mock(async () => ({}));
const contentStatContributionCreateManyMock = mock(
    async (args: {
        data: Array<{
            userId: number;
            gameMode: GameMode;
            itemType: "mapset" | "skin";
            itemId: number;
            rulesetVersion: number;
            ppVersion: number;
            correct: boolean;
            resultType: "guess" | "skip" | "timeout";
            responseTimeMs: number;
        }>;
        skipDuplicates: boolean;
    }) => {
        void args;
        return { count: 1 };
    },
);
const gameFindUniqueMock = mock(async () => null as { id: bigint } | null);
const gameCreateMock = mock(async (args: { data: { pp: number; [key: string]: unknown } }) => ({ id: 1n, endedAt: new Date(), ...args.data }));
const gameFindManyMock = mock(async () => [{ pp: 50 }]);
const gameRoundCreateManyMock = mock(async (args: { data: Array<{ difficultySnapshot: number | null; [key: string]: unknown }> }) => {
    void args;
    return { count: 1 };
});
const userAchievementFindUniqueMock = mock(async () => null as { highestStreak: number; highestScore: number; bestRunPp: number } | null);
const userAchievementUpsertMock = mock(async (args: { create: { profilePp: number; [key: string]: unknown }; [key: string]: unknown }) => {
    void args;
    return {};
});
const mapsetDataFindUniqueMock = mock(async () => ({
    mapsetId: 1,
    title: answer,
    artist: "Artist",
    mapper: "Mapper",
    rankedAt: null,
    starRatingMin: null,
    starRatingMax: null,
}));
const mapsetDataFindManyMock = mock(async () => [] as Array<{ title: string | null }>);
const skinFindUniqueMock = mock(async () => null);
const skinFindManyMock = mock(async () => [] as Array<{ name: string }>);
const txMock = {
    contentStat: { findUnique: contentStatFindUniqueMock, upsert: contentStatUpsertMock },
    contentStatContribution: { createMany: contentStatContributionCreateManyMock },
    game: { findUnique: gameFindUniqueMock, create: gameCreateMock, findMany: gameFindManyMock },
    gameRound: { createMany: gameRoundCreateManyMock },
    userAchievement: { findUnique: userAchievementFindUniqueMock, upsert: userAchievementUpsertMock },
};
const transactionMock = mock(async (operation: (tx: typeof txMock) => Promise<unknown>) => operation(txMock));
const prismaMock = {
    contentStat: { findMany: contentStatFindManyMock },
    mapsetData: { findUnique: mapsetDataFindUniqueMock, findMany: mapsetDataFindManyMock },
    skin: { findUnique: skinFindUniqueMock, findMany: skinFindManyMock },
    $transaction: transactionMock,
};
const getRandomActionMock = mock(async () => ({
    data: {
        mapset_id: 2,
        title: "Next Map",
        artist: "Artist",
        mapper: "Mapper",
        image_filename: "next.webp",
        audio_filename: "next.mp3",
    },
    backgroundData: "next-media",
}));
const getMediaDataMock = mock(async () => "current-media");
const authSessionMock = mock(async () => ({ user: { banchoId: userId } }));

const redisValues = new Map<string, string>();
const redisSetMock = mock(async (key: string, value: string, options?: { condition?: string }) => {
    if (options?.condition === "NX" && redisValues.has(key)) return null;
    redisValues.set(key, value);
    return "OK";
});
const redisClientMock = {
    get: mock(async (key: string) => redisValues.get(key) ?? null),
    set: redisSetMock,
    eval: mock(async (_script: string, options: { keys: string[] }) => (redisValues.delete(options.keys[0]) ? 1 : 0)),
    sAdd: mock(async () => 1),
    sRem: mock(async () => 1),
    expire: mock(async () => 1),
};

mock.module("./server", () => ({ getAuthSession: authSessionMock }));
mock.module("./mapsets-server", () => ({
    getRandomAudioAction: getRandomActionMock,
    getRandomBackgroundAction: getRandomActionMock,
    getRandomSkinAction: getRandomActionMock,
}));
mock.module("./media", () => ({ getMediaData: getMediaDataMock }));
mock.module("@/lib/database/prisma", () => ({ prisma: prismaMock }));
mock.module("@/lib/redis", () => ({ default: redisClientMock }));

const { endGameAction, getGameStateAction, startGameAction, submitGuessAction } = await import("./game-server");

function makeSession(overrides: Partial<DatabaseGameSession> = {}): DatabaseGameSession {
    return {
        id: sessionId,
        user_id: userId,
        game_mode: GameMode.Background,
        total_points: 100,
        current_streak: 0,
        highest_streak: 0,
        current_round: 1,
        current_item_id: 1,
        time_left: 30,
        last_action_at: new Date().toISOString(),
        last_guess: null,
        last_guess_correct: null,
        last_points: null,
        correct_guesses: 0,
        total_time_used: 0,
        total_response_time_ms: 0,
        is_active: true,
        variant: "classic",
        run_type: "standard",
        challenge_id: null,
        seed: null,
        config_snapshot: null,
        ranked: true,
        ruleset_version: 1,
        pp_version: 1,
        started_at: new Date().toISOString(),
        round_history: [],
        title: answer,
        artist: "Artist",
        mapper: "Mapper",
        image_filename: "current.webp",
        audio_filename: "current.mp3",
        has_guessed_current_round: false,
        ...overrides,
    };
}

function putSession(session: DatabaseGameSession): void {
    redisValues.set(`game_session:${sessionId}`, JSON.stringify(session));
}

beforeEach(() => {
    redisValues.clear();
    contentStatFindManyMock.mockReset().mockResolvedValue([]);
    contentStatFindUniqueMock.mockReset().mockResolvedValue(null);
    contentStatUpsertMock.mockReset().mockResolvedValue({});
    contentStatContributionCreateManyMock.mockReset().mockResolvedValue({ count: 1 });
    gameFindUniqueMock.mockReset().mockResolvedValue(null);
    gameCreateMock.mockReset().mockImplementation(async (args) => ({ id: 1n, endedAt: new Date(), ...args.data }));
    gameFindManyMock.mockReset().mockResolvedValue([{ pp: 50 }]);
    gameRoundCreateManyMock.mockReset().mockImplementation(async () => ({ count: 1 }));
    userAchievementFindUniqueMock.mockReset().mockResolvedValue(null);
    userAchievementUpsertMock.mockReset().mockImplementation(async () => ({}));
    mapsetDataFindUniqueMock.mockReset().mockResolvedValue({
        mapsetId: 1,
        title: answer,
        artist: "Artist",
        mapper: "Mapper",
        rankedAt: null,
        starRatingMin: null,
        starRatingMax: null,
    });
    mapsetDataFindManyMock.mockReset().mockResolvedValue([]);
    skinFindUniqueMock.mockReset().mockResolvedValue(null);
    skinFindManyMock.mockReset().mockResolvedValue([]);
    transactionMock.mockReset().mockImplementation(async (operation) => operation(txMock));
    getRandomActionMock.mockReset().mockResolvedValue({
        data: {
            mapset_id: 2,
            title: "Next Map",
            artist: "Artist",
            mapper: "Mapper",
            image_filename: "next.webp",
            audio_filename: "next.mp3",
        },
        backgroundData: "next-media",
    });
    getMediaDataMock.mockReset().mockResolvedValue("current-media");
    authSessionMock.mockReset().mockResolvedValue({ user: { banchoId: userId } });
    redisSetMock.mockClear();
    redisClientMock.sRem.mockClear();
    setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => setSystemTime());

describe("game server lifecycle", () => {
    test("rejects invalid game settings before creating a session", async () => {
        await expect(startGameAction("invalid" as GameMode, "classic")).rejects.toThrow();
        expect(getRandomActionMock).not.toHaveBeenCalled();
    });

    test("persists a survival-mode correct guess before next-round content exhaustion", async () => {
        putSession(makeSession({ variant: "survival" }));

        const answered = await submitGuessAction(sessionId, answer);
        expect(answered.lastGuess?.correct).toBe(true);
        expect(getRandomActionMock).not.toHaveBeenCalled();

        const afterGuess = JSON.parse(redisValues.get(`game_session:${sessionId}`)!);
        expect(afterGuess.correct_guesses).toBe(1);
        expect(afterGuess.has_guessed_current_round).toBe(true);

        getRandomActionMock.mockRejectedValueOnce(new NoGameContentError("No background found"));
        const finished = await submitGuessAction(sessionId);

        expect(finished.gameStatus).toBe("finished");
        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(gameCreateMock).toHaveBeenCalledTimes(1);
        expect(Number(gameCreateMock.mock.calls[0]?.[0].data.pp)).toBeGreaterThan(0);
        expect(gameRoundCreateManyMock).toHaveBeenCalledTimes(1);
        expect(gameRoundCreateManyMock.mock.calls[0]?.[0].data[0]?.difficultySnapshot).toBe(1);
        expect(contentStatContributionCreateManyMock).toHaveBeenCalledTimes(1);
        expect(contentStatUpsertMock).toHaveBeenCalledTimes(1);
        expect(userAchievementUpsertMock).toHaveBeenCalledTimes(1);
        expect(Number(userAchievementUpsertMock.mock.calls[0]?.[0].create.profilePp)).toBeGreaterThan(0);
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
    });

    test("survival requeues mistakes and ends on the third one", async () => {
        putSession(makeSession({ variant: "survival" }));

        for (let mistakes = 1; mistakes <= 2; mistakes++) {
            const failedGuess = await submitGuessAction(sessionId, "wrong answer");
            expect(failedGuess.gameStatus).toBe("active");
            expect(failedGuess.rounds.mistakes).toBe(mistakes);
            await submitGuessAction(sessionId);
        }

        const thirdMistake = await submitGuessAction(sessionId, "wrong answer");
        expect(thirdMistake.gameStatus).toBe("finished");
        expect(thirdMistake.rounds.mistakes).toBe(3);
        expect(redisClientMock.sRem).toHaveBeenCalledTimes(2);
        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(gameCreateMock).toHaveBeenCalledTimes(1);
    });

    test("counts only the first difficulty sample from a user for an item", async () => {
        contentStatContributionCreateManyMock.mockResolvedValueOnce({ count: 0 });
        putSession(makeSession({ variant: "death" }));

        await submitGuessAction(sessionId, answer);
        await endGameAction(sessionId);

        expect(contentStatContributionCreateManyMock).toHaveBeenCalledTimes(1);
        expect(contentStatContributionCreateManyMock.mock.calls[0]?.[0]).toMatchObject({
            data: [
                {
                    userId,
                    gameMode: GameMode.Background,
                    itemType: "mapset",
                    itemId: 1,
                    rulesetVersion: 1,
                    ppVersion: 1,
                    correct: true,
                },
            ],
            skipDuplicates: true,
        });
        expect(contentStatFindUniqueMock).not.toHaveBeenCalled();
        expect(contentStatUpsertMock).not.toHaveBeenCalled();
    });

    test("keeps arcade score separate from pp in death mode", async () => {
        putSession(makeSession({ variant: "death", total_points: 0 }));

        const correct = await submitGuessAction(sessionId, answer);
        expect(correct.score.total).toBe(160);
        expect(correct.pp).toBeUndefined();

        await submitGuessAction(sessionId);
        const finished = await submitGuessAction(sessionId, "wrong answer");

        expect(finished.score.total).toBe(110);
        expect(finished.pp).toBeGreaterThan(0);
        expect(gameCreateMock.mock.calls[0]?.[0].data.points).toBe(110);
    });

    test("allows advancing after a null guess skips the round", async () => {
        putSession(makeSession());

        const skipped = await submitGuessAction(sessionId, null);

        expect(skipped.currentBeatmap.revealed).toBe(true);
        expect(skipped.lastGuess?.type).toBe("skip");
        expect(JSON.parse(redisValues.get(`game_session:${sessionId}`)!).has_guessed_current_round).toBe(true);

        const next = await submitGuessAction(sessionId);
        expect(next.rounds.current).toBe(2);
        expect(next.currentBeatmap.revealed).toBe(false);
    });

    test("charges recovered timer time once after answering", async () => {
        setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
        putSession(
            makeSession({
                last_action_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
                time_left: 30,
            }),
        );

        const recovered = await getGameStateAction(sessionId);
        expect(recovered.timeLeft).toBe(25);

        const answered = await submitGuessAction(sessionId, answer);
        expect(answered.rounds.totalTimeUsed).toBe(5);

        const persistedRound = JSON.parse(redisValues.get(`game_session:${sessionId}`)!).round_history[0];
        expect(persistedRound.response_time_ms).toBe(5000);
        expect(persistedRound.result_type).toBe("guess");
        expect(persistedRound.answer_snapshot).toBe(answer);

        const state = await getGameStateAction(sessionId);
        expect(state.timeLeft).toBe(25);
        expect(state.rounds.totalTimeUsed).toBe(5);
    });

    test("does not rewrite a session while reading its current state", async () => {
        putSession(makeSession());

        await getGameStateAction(sessionId);

        expect(redisSetMock).not.toHaveBeenCalled();
    });

    test("does not persist an unanswered classic final round", async () => {
        putSession(makeSession({ current_round: 15, has_guessed_current_round: false }));

        await endGameAction(sessionId);

        expect(transactionMock).not.toHaveBeenCalled();
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
    });

    test("does not persist a death run that fails on the first map", async () => {
        putSession(makeSession({ variant: "death" }));

        const finished = await submitGuessAction(sessionId, "wrong answer");

        expect(finished.gameStatus).toBe("finished");
        expect(finished.score.highestStreak).toBe(0);
        expect(transactionMock).not.toHaveBeenCalled();
        expect(gameCreateMock).not.toHaveBeenCalled();
        expect(userAchievementUpsertMock).not.toHaveBeenCalled();
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":false');
    });

    test("keeps a failed finalization pending and retries it safely", async () => {
        putSession(makeSession({ variant: "death", highest_streak: 1 }));
        transactionMock.mockRejectedValueOnce(new Error("database unavailable"));

        await expect(endGameAction(sessionId)).rejects.toThrow("database unavailable");
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":true');

        await endGameAction(sessionId);

        expect(transactionMock).toHaveBeenCalledTimes(2);
        expect(gameCreateMock).toHaveBeenCalledTimes(1);
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":false');
    });

    test("recovers an ambiguously committed finalization without counting it twice", async () => {
        putSession(makeSession({ variant: "death", is_active: false, end_pending: true, highest_streak: 1 }));
        gameFindUniqueMock.mockResolvedValueOnce({ id: 1n });

        const recovered = await getGameStateAction(sessionId);

        expect(recovered.gameStatus).toBe("finished");
        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(gameCreateMock).not.toHaveBeenCalled();
        expect(gameRoundCreateManyMock).not.toHaveBeenCalled();
        expect(userAchievementUpsertMock).not.toHaveBeenCalled();
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":false');
    });

    test("keeps a frozen difficulty snapshot while retrying finalization", async () => {
        putSession(
            makeSession({
                variant: "death",
                is_active: false,
                end_pending: true,
                has_guessed_current_round: true,
                correct_guesses: 1,
                highest_streak: 1,
                total_response_time_ms: 5000,
                round_history: [
                    {
                        round_number: 1,
                        item_type: "mapset",
                        item_id: 1,
                        submitted_guess: answer,
                        answer_snapshot: answer,
                        result_type: "guess",
                        correct: true,
                        response_time_ms: 5000,
                        time_limit_ms: 30000,
                        points_earned: 0,
                        streak_before: 0,
                        streak_after: 1,
                        difficulty_snapshot: 1.234,
                        content_snapshot: null,
                    },
                ],
            }),
        );
        contentStatFindManyMock.mockResolvedValueOnce([{ itemId: 1, appearances: 100n, correctCount: 0n, totalResponseTimeMs: 3_000_000n }]);

        await getGameStateAction(sessionId);

        expect(gameRoundCreateManyMock.mock.calls[0]?.[0].data[0]?.difficultySnapshot).toBe(1.234);
    });

    test("persists an ended session only once", async () => {
        putSession(makeSession({ variant: "death", highest_streak: 1 }));

        await Promise.allSettled([endGameAction(sessionId), endGameAction(sessionId)]);

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(gameCreateMock).toHaveBeenCalledTimes(1);
    });
});
