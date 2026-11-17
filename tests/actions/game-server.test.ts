import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { GameMode, type DatabaseGameSession } from "@/actions/types";
import { NoGameContentError } from "@/lib/game/content-errors";
import { MediaUnavailableError } from "@/lib/media/media-format";
import { createGuestDailyAccessToken, getGuestDailyCookieName } from "@/lib/game/guest-daily-access";

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
const gameFindUniqueMock = mock(async () => null as { id: bigint; runType?: string; endReason?: string | null; roundsPlayed?: number } | null);
const dailyGameAttemptCreateMock = mock(async (args: { data: Record<string, unknown> }) => args.data);
const dailyGameAttemptUpsertMock = mock(async (args: { create: Record<string, unknown> }) => args.create);
const dailyGameAttemptFindUniqueMock = mock(async () => null as { sessionId: string } | null);
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
    dailyGameAttempt: { create: dailyGameAttemptCreateMock, upsert: dailyGameAttemptUpsertMock, findUnique: dailyGameAttemptFindUniqueMock },
    userAchievement: { findUnique: userAchievementFindUniqueMock, upsert: userAchievementUpsertMock },
};
const transactionMock = mock(async (operation: (tx: typeof txMock) => Promise<unknown>) => operation(txMock));
const prismaMock = {
    contentStat: { findMany: contentStatFindManyMock, findUnique: contentStatFindUniqueMock },
    game: { findUnique: gameFindUniqueMock },
    mapsetData: { findUnique: mapsetDataFindUniqueMock, findMany: mapsetDataFindManyMock },
    skin: { findUnique: skinFindUniqueMock, findMany: skinFindManyMock },
    dailyGameAttempt: { create: dailyGameAttemptCreateMock, upsert: dailyGameAttemptUpsertMock, findUnique: dailyGameAttemptFindUniqueMock },
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
const multiplayerLobby = {
    matchId: "match-1",
    startAt: Date.parse("2026-01-01T00:00:05.000Z"),
    players: [{ userId, finished: false, scoreSessionId: null as string | null }],
};
const requireActiveMultiplayerLobbyMock = mock(async () => multiplayerLobby);
const readMultiplayerLobbyMock = mock(async () => multiplayerLobby);
const getMultiplayerRoundStateMock = mock(async () => ({
    submitted: false,
    allSubmitted: true,
    ready: true,
    allReady: true,
    submittedCount: 1,
    readyCount: 1,
    participantCount: 1,
}));
const getOrCreateMultiplayerRoundMock = mock(async (_code: string, _round: number, create: () => Promise<unknown>) => create());
const updateMultiplayerProgressMock = mock(
    async (_code: string, _userId: number, _progress: { points: number; round: number; submittedRound?: number; readyRound?: number; scoreSessionId?: string | null; finished?: boolean }, _matchId?: string) => {
        void _matchId;
        if (_progress.scoreSessionId !== undefined) multiplayerLobby.players[0].scoreSessionId = _progress.scoreSessionId;
        if (_progress.finished !== undefined) multiplayerLobby.players[0].finished = _progress.finished;
    },
);

const redisValues = new Map<string, string>();
const cookieValues = new Map<string, string>();
const cookiesMock = mock(async () => ({
    get: (name: string) => {
        const value = cookieValues.get(name);
        return value ? { value } : undefined;
    },
    set: (name: string, value: string) => cookieValues.set(name, value),
}));
const redisSetMock = mock(async (key: string, value: string, options?: { condition?: string }) => {
    if (options?.condition === "NX" && redisValues.has(key)) return null;
    redisValues.set(key, value);
    return "OK";
});
const redisClientMock = {
    get: mock(async (key: string) => redisValues.get(key) ?? null),
    set: redisSetMock,
    eval: mock(async (_script: string, options: { keys: string[] }) => (redisValues.delete(options.keys[0]) ? 1 : 0)),
    del: mock(async (...keys: string[]) => keys.filter((key) => redisValues.delete(key)).length),
    sAdd: mock(async () => 1),
    sRem: mock(async () => 1),
    expire: mock(async () => 1),
};

mock.module("@/actions/server", () => ({ getAuthSession: authSessionMock }));
mock.module("next/headers", () => ({ cookies: cookiesMock }));
mock.module("@/lib/game/mapsets", () => ({
    getDailyAudio: getRandomActionMock,
    getDailyBackground: getRandomActionMock,
    getDailySkin: getRandomActionMock,
    getRandomAudio: getRandomActionMock,
    getRandomBackground: getRandomActionMock,
    getRandomSkin: getRandomActionMock,
}));
mock.module("@/actions/media", () => ({ getMediaData: getMediaDataMock }));
mock.module("@/lib/database/prisma", () => ({ prisma: prismaMock }));
mock.module("@/lib/infra/redis", () => ({ default: redisClientMock }));
mock.module("@/lib/multiplayer/multiplayer", () => ({
    getMultiplayerRoundState: getMultiplayerRoundStateMock,
    getOrCreateMultiplayerRound: getOrCreateMultiplayerRoundMock,
    normalizeLobbyCode: (code: string) => code.trim().toUpperCase(),
    readMultiplayerLobby: readMultiplayerLobbyMock,
    requireActiveMultiplayerLobby: requireActiveMultiplayerLobbyMock,
    updateMultiplayerProgress: updateMultiplayerProgressMock,
}));
mock.module("server-only", () => ({}));

const { beginDailyGameAction, claimGuestDailyResultAction, endGameAction, getGameStateAction, getGuestDailyResultAction, startGameAction, submitGuessAction } = await import("@/actions/game-server");

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
    cookieValues.clear();
    contentStatFindManyMock.mockReset().mockResolvedValue([]);
    contentStatFindUniqueMock.mockReset().mockResolvedValue(null);
    contentStatUpsertMock.mockReset().mockResolvedValue({});
    contentStatContributionCreateManyMock.mockReset().mockResolvedValue({ count: 1 });
    gameFindUniqueMock.mockReset().mockResolvedValue(null);
    dailyGameAttemptCreateMock.mockReset().mockImplementation(async (args) => args.data);
    dailyGameAttemptUpsertMock.mockReset().mockImplementation(async (args) => args.create);
    dailyGameAttemptFindUniqueMock.mockReset().mockResolvedValue(null);
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
    multiplayerLobby.matchId = "match-1";
    multiplayerLobby.startAt = Date.parse("2026-01-01T00:00:05.000Z");
    multiplayerLobby.players[0].finished = false;
    multiplayerLobby.players[0].scoreSessionId = null;
    requireActiveMultiplayerLobbyMock.mockClear();
    readMultiplayerLobbyMock.mockClear();
    getMultiplayerRoundStateMock.mockClear();
    getOrCreateMultiplayerRoundMock.mockClear();
    updateMultiplayerProgressMock.mockClear();
    redisSetMock.mockClear();
    redisClientMock.sRem.mockClear();
    setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => setSystemTime());

describe("game server lifecycle", () => {
    test("rejects regular game actions for Score PP sessions even when the pair ID matches a mapset", async () => {
        putSession(makeSession({ game_mode: GameMode.ScorePp }));

        await expect(submitGuessAction(sessionId, answer)).rejects.toThrow("Game session not found or expired");
        await expect(getGameStateAction(sessionId)).rejects.toThrow("Game session not found or expired");
        await expect(endGameAction(sessionId)).rejects.toThrow("Game session not found or expired");
    });

    test("penalizes skips and expired guesses for titles that normalize to empty", async () => {
        mapsetDataFindUniqueMock.mockResolvedValue({
            mapsetId: 1,
            title: "!!!",
            artist: "Artist",
            mapper: "Mapper",
            rankedAt: null,
            starRatingMin: null,
            starRatingMax: null,
        });

        for (const [guess, elapsedMs] of [
            [null, 1000],
            ["wrong answer", 40_000],
        ] as const) {
            putSession(makeSession({ total_points: 0, last_action_at: new Date(Date.now() - elapsedMs).toISOString() }));

            const result = await submitGuessAction(sessionId, guess);
            expect(result.lastGuess).toMatchObject({ correct: false, type: "skip" });
            expect(result.score.total).toBe(-50);
            expect(result.rounds.correctGuesses).toBe(0);
        }
    });

    test("freezes each round's difficulty before answering and keeps it through finalization", async () => {
        contentStatFindUniqueMock.mockResolvedValue({ appearances: 100n, correctCount: 20n, totalResponseTimeMs: 2_400_000n, fastestCorrectMs: null });
        const started = await startGameAction(GameMode.Background, "survival");

        contentStatFindUniqueMock.mockResolvedValue({ appearances: 100n, correctCount: 95n, totalResponseTimeMs: 400_000n, fastestCorrectMs: null });
        contentStatFindManyMock.mockResolvedValue([{ itemId: 2, appearances: 100n, correctCount: 95n, totalResponseTimeMs: 400_000n }]);
        await submitGuessAction(started.sessionId, answer);
        await submitGuessAction(started.sessionId);
        contentStatFindUniqueMock.mockResolvedValue({ appearances: 100n, correctCount: 20n, totalResponseTimeMs: 2_400_000n, fastestCorrectMs: null });
        await submitGuessAction(started.sessionId, answer);
        await endGameAction(started.sessionId);

        expect(gameRoundCreateManyMock.mock.calls[0]?.[0].data.map((round) => round.difficultySnapshot)).toEqual([1.456, 0.75]);
    });

    test("rejects invalid game settings before creating a session", async () => {
        await expect(startGameAction("invalid" as GameMode, "classic")).rejects.toThrow();
        expect(getRandomActionMock).not.toHaveBeenCalled();
    });

    test("starts a five-round daily run and claims the user-mode attempt", async () => {
        const started = await startGameAction(GameMode.Background, "classic", undefined, "daily");
        const stored = JSON.parse(redisValues.get(`game_session:${started.sessionId}`)!);

        expect(started.rounds.total).toBe(5);
        expect(started.runType).toBe("daily");
        expect(stored.run_type).toBe("daily");
        expect(stored.ranked).toBe(false);
        expect(dailyGameAttemptCreateMock.mock.calls[0]?.[0].data).toMatchObject({ userId, gameMode: GameMode.Background, sessionId: started.sessionId });
    });

    test("issues a browser-bound cookie for an unauthenticated daily run", async () => {
        authSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

        const started = await startGameAction(GameMode.Background, "classic", undefined, "daily");

        expect(cookieValues.has(getGuestDailyCookieName(started.sessionId))).toBe(true);
    });

    test("denies guest daily result access without its browser cookie", async () => {
        await expect(getGuestDailyResultAction(sessionId)).rejects.toThrow("Game session not found or expired");
    });

    test("resumes an existing active daily session instead of claiming another attempt", async () => {
        const existing = makeSession({ run_type: "daily", daily_day: 1, current_round: 3, has_guessed_current_round: false });
        putSession(existing);
        dailyGameAttemptFindUniqueMock.mockResolvedValue({ sessionId });

        const resumed = await startGameAction(GameMode.Background, "classic", undefined, "daily");

        expect(resumed.sessionId).toBe(sessionId);
        expect(resumed.rounds.current).toBe(3);
        expect(dailyGameAttemptCreateMock).not.toHaveBeenCalled();
    });

    test("returns the existing completed daily score when a guest claim conflicts", async () => {
        putSession(makeSession({ user_id: 0, run_type: "daily", is_active: false, current_round: 5, has_guessed_current_round: true }));
        cookieValues.set(getGuestDailyCookieName(sessionId), createGuestDailyAccessToken(sessionId));
        dailyGameAttemptCreateMock.mockRejectedValueOnce({ code: "P2002" });
        dailyGameAttemptFindUniqueMock.mockResolvedValueOnce({ sessionId: "previous-daily-session" });
        gameFindUniqueMock.mockResolvedValueOnce({ id: 42n, runType: "daily", endReason: "completed", roundsPlayed: 5 });

        await expect(claimGuestDailyResultAction(sessionId)).resolves.toBe("42");
    });

    test("does not redirect a conflicting guest claim to an incomplete daily attempt", async () => {
        putSession(makeSession({ user_id: 0, run_type: "daily", is_active: false, current_round: 5, has_guessed_current_round: true }));
        cookieValues.set(getGuestDailyCookieName(sessionId), createGuestDailyAccessToken(sessionId));
        dailyGameAttemptCreateMock.mockRejectedValueOnce({ code: "P2002" });
        dailyGameAttemptFindUniqueMock.mockResolvedValueOnce({ sessionId: "incomplete-daily-session" });
        gameFindUniqueMock.mockResolvedValueOnce({ id: 42n, runType: "daily", endReason: "completed", roundsPlayed: 4 });

        await expect(claimGuestDailyResultAction(sessionId)).rejects.toThrow("DAILY_CHALLENGE_ALREADY_PLAYED");
    });

    test("counts unplayed daily rounds as timeouts when leaving", async () => {
        putSession(makeSession({ run_type: "daily", ranked: false, daily_day: 1, current_round: 1, total_points: 0 }));

        const result = await endGameAction(sessionId);
        const continued = JSON.parse(redisValues.get(`game_session:${sessionId}`)!);

        expect(result).toBe(0);
        expect(continued.is_active).toBe(false);
        expect(continued.current_round).toBe(5);
        expect(continued.round_history).toHaveLength(5);
        expect(continued.round_history[0]).toMatchObject({ result_type: "timeout", correct: false, round_number: 1 });
    });

    test("shares multiplayer first-round start time and reuses the active session", async () => {
        setSystemTime(new Date("2026-01-01T00:00:10.000Z"));

        const first = await startGameAction(GameMode.Background, "classic", "room123");
        setSystemTime(new Date("2026-01-01T00:00:15.000Z"));
        const second = await startGameAction(GameMode.Background, "classic", "room123");

        const firstSession = JSON.parse(redisValues.get(`game_session:${first.sessionId}`)!);
        const sharedStartedAt = new Date("2026-01-01T00:00:05.000Z").toISOString();

        expect(second.sessionId).toBe(first.sessionId);
        expect(first.timeLeft).toBe(25);
        expect(second.timeLeft).toBe(20);
        expect(firstSession.started_at).toBe(sharedStartedAt);
        expect(firstSession.last_action_at).toBe(sharedStartedAt);
        expect(firstSession.ranked).toBe(true);
        expect(firstSession.multiplayer_match_id).toBe("match-1");
        expect(getOrCreateMultiplayerRoundMock.mock.calls.map(([code]) => code)).toEqual(["ROOM123:match-1"]);
        expect(updateMultiplayerProgressMock.mock.calls.map(([, , , matchId]) => matchId)).toEqual(["match-1"]);
        expect(multiplayerLobby.players[0].scoreSessionId).toBe(first.sessionId);
    });

    test("rejects a game session from a previous multiplayer match", async () => {
        putSession(makeSession({ multiplayer_lobby_id: "ROOM123", multiplayer_match_id: "old-match" }));

        await expect(getGameStateAction(sessionId)).rejects.toThrow("Game session belongs to a previous match");
        await expect(submitGuessAction(sessionId, answer)).rejects.toThrow("Game session belongs to a previous match");
    });

    test("keeps a survival result retryable on media failure and saves it on content exhaustion", async () => {
        putSession(makeSession({ variant: "survival" }));

        const answered = await submitGuessAction(sessionId, answer);
        expect(answered.lastGuess?.correct).toBe(true);
        expect(getRandomActionMock).not.toHaveBeenCalled();

        const afterGuess = JSON.parse(redisValues.get(`game_session:${sessionId}`)!);
        expect(afterGuess.correct_guesses).toBe(1);
        expect(afterGuess.has_guessed_current_round).toBe(true);

        getRandomActionMock.mockRejectedValueOnce(new MediaUnavailableError());
        await expect(submitGuessAction(sessionId)).rejects.toBeInstanceOf(MediaUnavailableError);
        const recovered = await getGameStateAction(sessionId);
        expect(recovered.gameStatus).toBe("active");
        expect(recovered.rounds.current).toBe(1);
        expect(recovered.currentBeatmap.revealed).toBe(true);
        expect(recovered.score.total).toBe(answered.score.total);
        expect(gameCreateMock).not.toHaveBeenCalled();

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
        putSession(makeSession({ variant: "survival" }));

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

    test("keeps arcade score separate from pp in survival mode", async () => {
        putSession(makeSession({ variant: "survival", total_points: 0 }));

        const correct = await submitGuessAction(sessionId, answer);
        expect(correct.score.total).toBe(160);
        expect(correct.pp).toBeUndefined();

        await submitGuessAction(sessionId);
        const afterMistake = await submitGuessAction(sessionId, "wrong answer");
        const pp = await endGameAction(sessionId);

        expect(afterMistake.score.total).toBe(110);
        expect(pp).toBeGreaterThan(0);
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

    test("rejects advancing before a reveal and awards each round only once", async () => {
        putSession(makeSession({ total_points: 0 }));
        await expect(submitGuessAction(sessionId)).rejects.toThrow("before advancing");

        const answered = await submitGuessAction(sessionId, answer);
        expect(answered.currentBeatmap.revealed).toBe(true);
        expect(answered.rounds.correctGuesses).toBe(1);
        await expect(submitGuessAction(sessionId, answer)).rejects.toThrow("Already submitted");

        const next = await submitGuessAction(sessionId);
        expect(next.rounds.current).toBe(2);
        expect(next.rounds.correctGuesses).toBe(1);
        expect(next.score.total).toBe(answered.score.total);
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
        expect(persistedRound.answered_at).toBe("2026-01-01T00:00:05.000Z");

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

    test("keeps a failed finalization pending and retries it safely", async () => {
        putSession(makeSession({ variant: "survival", current_round: 2, highest_streak: 1 }));
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

    test("retries a serializable transaction write conflict during finalization", async () => {
        putSession(makeSession({ variant: "survival", current_round: 2, highest_streak: 1 }));
        transactionMock.mockRejectedValueOnce(Object.assign(new Error("write conflict"), { code: "P2034" }));

        await endGameAction(sessionId);

        expect(transactionMock).toHaveBeenCalledTimes(2);
        expect(gameCreateMock).toHaveBeenCalledTimes(1);
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":false');
    });

    test("recovers an ambiguously committed finalization without counting it twice", async () => {
        putSession(makeSession({ variant: "survival", current_round: 2, is_active: false, end_pending: true, highest_streak: 1 }));
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
                variant: "survival",
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
        putSession(makeSession({ variant: "survival", current_round: 2, highest_streak: 1 }));

        await Promise.allSettled([endGameAction(sessionId), endGameAction(sessionId)]);

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(gameCreateMock).toHaveBeenCalledTimes(1);
    });
    test("expires the remaining daily rounds after time offline", async () => {
        putSession(makeSession({ run_type: "daily", ranked: false, daily_day: 1 }));
        setSystemTime(new Date("2026-01-01T00:10:00Z"));
        const resumed = await getGameStateAction(sessionId);
        expect(resumed.gameStatus).toBe("finished");
        expect(resumed.rounds.current).toBe(5);
        expect(gameRoundCreateManyMock.mock.calls.at(-1)?.[0].data).toHaveLength(5);
    });

    test("starts daily time after preloading and never resets an acknowledged timer", async () => {
        const state = await startGameAction(GameMode.Background, "classic", undefined, "daily");
        expect(state.dailyMedia).toHaveLength(5);
        setSystemTime(new Date("2026-01-01T00:01:00Z"));
        const ready = await beginDailyGameAction(state.sessionId);
        expect(ready.timeLeft).toBe(15);
        setSystemTime(new Date("2026-01-01T00:01:05Z"));
        expect((await beginDailyGameAction(state.sessionId)).timeLeft).toBe(10);
    });

});
