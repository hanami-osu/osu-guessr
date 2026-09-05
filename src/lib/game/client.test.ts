import { beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GameMode, type GameState } from "@/actions/types";

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
const submitGuessActionMock = mock(async (): Promise<GameState> => ({
    ...initialGameState,
    score: { total: 100, current: 100, streak: 1, highestStreak: 1 },
    lastGuess: { correct: true, answer: "correct answer", type: "guess" as const },
}));
const getGameStateActionMock = mock(async () => initialGameState);
const endGameActionMock = mock(async () => {});
const storageValues = new Map<string, string>();
type WindowEvent = { type: string; persisted?: boolean };

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
    let windowListeners: Map<string, Set<(event: WindowEvent) => void>>;

    beforeAll(async () => {
        ({ GameClient } = await import("./client"));
    });

    beforeEach(() => {
        storageValues.clear();
        windowListeners = new Map();
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                location: { reload: mock() },
                addEventListener: (type: string, listener: (event: WindowEvent) => void) => {
                    const listeners = windowListeners.get(type) ?? new Set();
                    listeners.add(listener);
                    windowListeners.set(type, listeners);
                },
                removeEventListener: (type: string, listener: (event: WindowEvent) => void) => {
                    windowListeners.get(type)?.delete(listener);
                },
                dispatchEvent: (event: WindowEvent) => {
                    windowListeners.get(event.type)?.forEach((listener) => listener(event));
                    return true;
                },
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

    test("coalesces concurrent next-round actions", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();

        let resolveSubmit!: (state: GameState) => void;
        const submitPromise = new Promise<GameState>((resolve) => {
            resolveSubmit = resolve;
        });
        submitGuessActionMock.mockReturnValueOnce(submitPromise);

        const firstCall = client.goNextRound();
        const secondCall = client.goNextRound();

        await Promise.resolve();
        expect(submitGuessActionMock).toHaveBeenCalledTimes(1);

        resolveSubmit(initialGameState);
        await Promise.all([firstCall, secondCall]);
        client.dispose();
    });

    test("clears the stored session when disposed", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();
        expect(storageValues.get("osu-guessr:game-session:audio:classic")).toBe(initialGameState.sessionId);

        client.dispose();

        expect(storageValues.has("osu-guessr:game-session:audio:classic")).toBe(false);
        const resumedClient = new GameClient(events, GameMode.Audio, "classic");
        await expect(resumedClient.resumeStoredGame()).resolves.toBe(false);
        expect(getGameStateActionMock).not.toHaveBeenCalled();
        resumedClient.dispose();
    });

    test("clears the stored session when the page is hidden", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();

        window.dispatchEvent(new Event("pagehide"));

        expect(storageValues.has("osu-guessr:game-session:audio:classic")).toBe(false);
        const resumedClient = new GameClient(events, GameMode.Audio, "classic");
        await expect(resumedClient.resumeStoredGame()).resolves.toBe(false);
        expect(getGameStateActionMock).not.toHaveBeenCalled();
        resumedClient.dispose();
    });

    test("waits for an in-flight mutation before ending the game", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();

        let resolveSubmit!: (state: GameState) => void;
        const submitPromise = new Promise<GameState>((resolve) => {
            resolveSubmit = resolve;
        });
        submitGuessActionMock.mockReturnValueOnce(submitPromise);

        const mutationCall = client.goNextRound();
        await Promise.resolve();
        const endCall = client.endGame();

        expect(endGameActionMock).not.toHaveBeenCalled();

        resolveSubmit(initialGameState);
        await Promise.all([mutationCall, endCall]);
        expect(endGameActionMock).toHaveBeenCalledTimes(1);
        client.dispose();
    });

    test("does not persist a session when start resolves after the page is hidden", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        let resolveStart!: (state: typeof initialGameState) => void;
        startGameActionMock.mockReturnValueOnce(new Promise((resolve) => {
            resolveStart = resolve;
        }));

        const startCall = client.startGame();
        await Promise.resolve();
        window.dispatchEvent(new Event("pagehide"));

        resolveStart(initialGameState);
        await startCall;

        expect(storageValues.has("osu-guessr:game-session:audio:classic")).toBe(false);
        client.dispose();
    });

    test("reloads when a persisted page is shown again after being hidden", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();

        window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
        window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

        expect(window.location.reload).toHaveBeenCalledTimes(1);
        client.dispose();
    });

    test("coalesces concurrent end-game actions", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();
        let resolveEnd!: () => void;
        endGameActionMock.mockReturnValueOnce(new Promise<void>((resolve) => {
            resolveEnd = resolve;
        }));

        const firstCall = client.endGame();
        const secondCall = client.endGame();
        await Promise.resolve();

        resolveEnd();
        await Promise.all([firstCall, secondCall]);

        expect(endGameActionMock).toHaveBeenCalledTimes(1);
        client.dispose();
    });

    test("does not start a mutation after ending begins", async () => {
        const client = new GameClient(events, GameMode.Audio, "classic");
        await client.startGame();
        let resolveEnd!: () => void;
        endGameActionMock.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                resolveEnd = resolve;
            }),
        );

        const endCall = client.endGame();
        const mutationCall = client.goNextRound();
        await Promise.resolve();

        expect(submitGuessActionMock).not.toHaveBeenCalled();
        resolveEnd();
        await Promise.all([endCall, mutationCall]);
    });
});
