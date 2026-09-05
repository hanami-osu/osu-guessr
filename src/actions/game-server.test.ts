import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { GameMode, type DatabaseGameSession } from "./types";
import { NoGameContentError } from "@/lib/game/content-errors";

const sessionId = "00000000-0000-4000-8000-000000000000";
const userId = 123;
const answer = "Test Map";

const queryMock = mock(async (sql: string) => {
    void sql;
    return [] as unknown[];
});
const transactionMock = mock(async (operation: (query: typeof queryMock) => Promise<unknown>) => operation(queryMock));
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
    expire: mock(async () => 1),
};

mock.module("./server", () => ({ getAuthSession: authSessionMock }));
mock.module("./mapsets-server", () => ({
    getRandomAudioAction: getRandomActionMock,
    getRandomBackgroundAction: getRandomActionMock,
    getRandomSkinAction: getRandomActionMock,
}));
mock.module("./media", () => ({ getMediaData: getMediaDataMock }));
mock.module("@/lib/database", () => ({ query: queryMock, transaction: transactionMock }));
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
        is_active: true,
        variant: "classic",
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
    queryMock.mockReset().mockImplementation(async (sql) =>
        sql.includes("ROW_COUNT()")
            ? [{ inserted: 1 }]
            : [
                  {
                      mapset_id: 1,
                      title: answer,
                      artist: "Artist",
                      mapper: "Mapper",
                      image_filename: "current.webp",
                      audio_filename: "current.mp3",
                  },
              ],
    );
    transactionMock.mockReset().mockImplementation(async (operation) => operation(queryMock));
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
    setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => setSystemTime());

describe("game server lifecycle", () => {
    test("rejects invalid game settings before creating a session", async () => {
        await expect(startGameAction("invalid" as GameMode, "classic")).rejects.toThrow();
        expect(getRandomActionMock).not.toHaveBeenCalled();
    });

    test("persists a death-mode correct guess before next-round content exhaustion", async () => {
        putSession(makeSession({ variant: "death" }));

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
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
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
        putSession(makeSession({ current_round: 10, has_guessed_current_round: false }));

        await endGameAction(sessionId);

        expect(transactionMock).not.toHaveBeenCalled();
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
    });

    test("keeps a failed finalization pending and retries it safely", async () => {
        putSession(makeSession({ variant: "death" }));
        transactionMock.mockRejectedValueOnce(new Error("database unavailable"));

        await expect(endGameAction(sessionId)).rejects.toThrow("database unavailable");
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":true');

        await endGameAction(sessionId);

        expect(transactionMock).toHaveBeenCalledTimes(2);
        expect(queryMock).toHaveBeenCalledTimes(3);
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"is_active":false');
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":false');
    });

    test("recovers an ambiguously committed finalization without counting it twice", async () => {
        putSession(makeSession({ variant: "death", is_active: false, end_pending: true }));
        queryMock.mockImplementation(async (sql) => {
            if (sql.includes("ROW_COUNT()")) return [{ inserted: 0 }];
            if (sql.includes("FROM mapset_data")) {
                return [
                    {
                        mapset_id: 1,
                        title: answer,
                        artist: "Artist",
                        mapper: "Mapper",
                        image_filename: "current.webp",
                        audio_filename: "current.mp3",
                    },
                ];
            }
            return [];
        });

        const recovered = await getGameStateAction(sessionId);

        expect(recovered.gameStatus).toBe("finished");
        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(queryMock.mock.calls.map(([sql]) => sql)).toEqual([
            expect.stringContaining("INSERT IGNORE INTO games"),
            "SELECT ROW_COUNT() AS inserted",
        ]);
        expect(redisValues.get(`game_session:${sessionId}`)).toContain('"end_pending":false');
    });

    test("persists an ended session only once", async () => {
        putSession(makeSession({ variant: "death" }));

        await Promise.allSettled([endGameAction(sessionId), endGameAction(sessionId)]);

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(queryMock).toHaveBeenCalledTimes(3);
    });
});
