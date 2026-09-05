import { beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GameMode } from "@/actions/types";

Object.assign(process.env, {
    DATABASE_URL: "mysql://root@localhost:3306/test",
    REDIS_URL: "redis://localhost:6379",
    AUTH_SECRET: "test",
    OSU_CLIENT_ID: "test",
    OSU_CLIENT_SECRET: "test",
    OSU_API_KEY: "test",
});

const initialGameState = {
    sessionId: "mock-session-id",
    timeLeft: 10,
    gameStatus: "active" as const,
    variant: "classic" as const,
    score: { total: 0, current: 0, streak: 0, highestStreak: 0 },
    rounds: { current: 1, total: 10, correctGuesses: 0, totalTimeUsed: 0 },
    currentBeatmap: { revealed: false },
};
const startGameActionMock = mock(async () => initialGameState);
const submitGuessActionMock = mock(async () => ({
    ...initialGameState,
    score: { total: 100, current: 100, streak: 1, highestStreak: 1 },
    lastGuess: { correct: true, answer: "correct answer", type: "guess" as const },
}));
const getGameStateActionMock = mock(async () => initialGameState);
const endGameActionMock = mock(async () => {});
const storageValues = new Map<string, string>();

mock.module("@/actions/game-server", () => ({
    startGameAction: startGameActionMock,
    submitGuessAction: submitGuessActionMock,
    endGameAction: endGameActionMock,
    getGameStateAction: getGameStateActionMock,
    getSuggestionsAction: mock(async () => []),
}));

let GameClient: typeof import("./client").GameClient;

describe("GameClient", () => {
    let events: { onStateUpdate: ReturnType<typeof mock>; onError: ReturnType<typeof mock> };

    beforeAll(async () => {
        ({ GameClient } = await import("./client"));
    });

    beforeEach(() => {
        storageValues.clear();
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                location: { reload: mock() },
                sessionStorage: {
                    getItem: (key: string) => storageValues.get(key) ?? null,
                    removeItem: (key: string) => storageValues.delete(key),
                    setItem: (key: string, value: string) => storageValues.set(key, value),
                },
            },
        });
        startGameActionMock.mockReset().mockResolvedValue(initialGameState);
        submitGuessActionMock.mockReset().mockResolvedValue({
            ...initialGameState,
            score: { total: 100, current: 100, streak: 1, highestStreak: 1 },
            lastGuess: { correct: true, answer: "correct answer", type: "guess" as const },
        });
        getGameStateActionMock.mockReset().mockResolvedValue(initialGameState);
        endGameActionMock.mockReset().mockResolvedValue(undefined);
        events = { onStateUpdate: mock(), onError: mock() };
    });

    test("emits the initial state immediately when starting", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();

        expect(events.onStateUpdate).toHaveBeenCalledWith(initialGameState);
        client.dispose();
    });

    test("preserves a stored game when resume fails transiently", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic", { maxRetries: 1 });
        storageValues.set("osu-guessr:game-session:audio:classic", "stored-session");
        getGameStateActionMock.mockRejectedValueOnce(new Error("network unavailable"));
        const consoleError = spyOn(console, "error").mockImplementation(() => {});

        try {
            await expect(client.resumeStoredGame()).rejects.toThrow("network unavailable");
            expect(storageValues.get("osu-guessr:game-session:audio:classic")).toBe("stored-session");
        } finally {
            consoleError.mockRestore();
        }
    });

    test("does not retry a mutating guess after an unknown failure", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic", { maxRetries: 3, retryDelay: 0 });
        await client.startGame();
        submitGuessActionMock.mockRejectedValueOnce(new Error("temporary failure"));
        const consoleError = spyOn(console, "error").mockImplementation(() => {});

        try {
            await expect(client.submitGuess("guess")).rejects.toThrow("temporary failure");
            expect(submitGuessActionMock).toHaveBeenCalledTimes(1);
            expect(getGameStateActionMock).toHaveBeenCalledTimes(1);
        } finally {
            client.dispose();
            consoleError.mockRestore();
        }
    });

    test("restarts the round timer after recovering from a failed mutation", async () => {
        const activeState = { ...initialGameState, timeLeft: 1 };
        const client = new GameClient(events, GameMode.Audio, "classic", { maxRetries: 1 });
        startGameActionMock.mockResolvedValueOnce(activeState);
        getGameStateActionMock.mockResolvedValueOnce(activeState);
        submitGuessActionMock.mockRejectedValueOnce(new Error("temporary failure"));
        const consoleError = spyOn(console, "error").mockImplementation(() => {});

        try {
            await client.startGame();
            await expect(client.submitGuess("guess")).rejects.toThrow("temporary failure");
            await new Promise((resolve) => setTimeout(resolve, 1100));

            expect(submitGuessActionMock).toHaveBeenCalledTimes(2);
        } finally {
            client.dispose();
            consoleError.mockRestore();
        }
    });

    test("keeps an active session retryable when saving the result fails", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic", { maxRetries: 1 });
        await client.startGame();
        endGameActionMock.mockRejectedValueOnce(new Error("database unavailable"));
        const consoleError = spyOn(console, "error").mockImplementation(() => {});

        try {
            await expect(client.endGame()).rejects.toThrow("database unavailable");
            await client.endGame();

            expect(endGameActionMock).toHaveBeenCalledTimes(2);
        } finally {
            consoleError.mockRestore();
        }
    });
});
