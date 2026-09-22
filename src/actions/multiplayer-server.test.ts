import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { GameMode } from "@/actions/types";
import type { MultiplayerLobby, MultiplayerPlayer } from "@/lib/multiplayer";

type AuthSession = {
    expires: string;
    user: { banchoId: number; name: string; image: string | null };
};

const lobbyCode = "ABC23456";
const now = new Date("2026-01-01T00:00:00.000Z");
const redisValues = new Map<string, string>();
const redisSets = new Map<string, Set<string>>();
const presence = new Map<string, Set<number>>();

const authSessionMock = mock(async (): Promise<AuthSession> => sessionFor(1));
const acquireRedisLockMock = mock(async (key: string) => ({ key, token: key }));
const releaseRedisLockMock = mock(async () => {});
const getPresentMultiplayerUsersMock = mock(async (code: string) => [...(presence.get(code.trim().toUpperCase()) ?? [])]);
const publishMultiplayerLobbyMock = mock(async () => {});
const publishMultiplayerLobbyDeletedMock = mock(async () => {});
const publishMultiplayerBrowserChangedMock = mock(async () => {});

const redisClientMock = {
    get: mock(async (key: string) => redisValues.get(key) ?? null),
    set: mock(async (key: string, value: string, options?: { condition?: string }) => {
        if (options?.condition === "NX" && redisValues.has(key)) return null;
        redisValues.set(key, value);
        return "OK";
    }),
    eval: mock(async (_script: string, options: { keys: string[]; arguments?: string[] }) => {
        const key = options.keys[0];
        const expected = options.arguments?.[0];
        if (expected === undefined || redisValues.get(key) !== expected) return 0;
        redisValues.delete(key);
        return 1;
    }),
    sAdd: mock(async (key: string, members: string | string[]) => {
        const set = redisSets.get(key) ?? new Set<string>();
        for (const member of Array.isArray(members) ? members : [members]) set.add(member);
        redisSets.set(key, set);
        return Array.isArray(members) ? members.length : 1;
    }),
    sRem: mock(async (key: string, members: string | string[]) => {
        const set = redisSets.get(key);
        if (!set) return 0;
        let removed = 0;
        for (const member of Array.isArray(members) ? members : [members]) if (set.delete(member)) removed += 1;
        return removed;
    }),
    sMembers: mock(async (key: string) => [...(redisSets.get(key) ?? [])]),
    del: mock(async (...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) if (redisValues.delete(key)) deleted += 1;
        return deleted;
    }),
    publish: mock(async () => 1),
};

mock.module("server-only", () => ({}));
mock.module("@/actions/server", () => ({ getAuthSession: authSessionMock }));
mock.module("@/lib/redis", () => ({ default: redisClientMock }));
mock.module("@/lib/redis-lock-core", () => ({
    acquireRedisLock: acquireRedisLockMock,
    releaseRedisLock: releaseRedisLockMock,
}));
mock.module("@/lib/multiplayer-realtime", () => ({
    createMultiplayerSocketToken: mock(async () => "socket-token"),
    getPresentMultiplayerUsers: getPresentMultiplayerUsersMock,
    publishMultiplayerBrowserChanged: publishMultiplayerBrowserChangedMock,
    publishMultiplayerLobby: publishMultiplayerLobbyMock,
    publishMultiplayerLobbyDeleted: publishMultiplayerLobbyDeletedMock,
}));

const {
    joinMultiplayerLobbyAction,
    resetMultiplayerLobbyAction,
    setMultiplayerReadyAction,
    startMultiplayerLobbyAction,
    updateMultiplayerLobbyAction,
    leaveMultiplayerLobbyAction,
} = await import("./multiplayer-server");
const {
    addMultiplayerMessage,
    cleanupDisconnectedMultiplayerPlayer,
    disconnectMultiplayerPlayer,
    finishMultiplayerCountdown,
    readMultiplayerLobby,
    updateMultiplayerProgress,
} = await import("@/lib/multiplayer");

function sessionFor(userId: number): AuthSession {
    return {
        expires: "2099-01-01T00:00:00.000Z",
        user: { banchoId: userId, name: userId === 1 ? "Host" : `Player ${userId}`, image: null },
    };
}

function lobbyKey(code: string): string {
    return `multiplayer_lobby:${code}`;
}

function player(userId: number, overrides: Partial<MultiplayerPlayer> = {}): MultiplayerPlayer {
    return {
        userId,
        username: userId === 1 ? "Host" : `Player ${userId}`,
        avatarUrl: null,
        joinedAt: new Date(now.getTime() + userId * 1000).toISOString(),
        points: 0,
        round: 0,
        submittedRound: 0,
        readyRound: 0,
        resultRound: 0,
        resultCorrect: null,
        resultSkipped: false,
        resultPoints: 0,
        scoreSessionId: null,
        finished: false,
        completedMatch: false,
        ready: false,
        ...overrides,
    };
}

function putLobby(lobby: MultiplayerLobby): void {
    redisValues.set(lobbyKey(lobby.code), JSON.stringify(lobby));
}

function seedLobby(overrides: Partial<MultiplayerLobby> = {}): MultiplayerLobby {
    const lobby: MultiplayerLobby = {
        code: lobbyCode,
        name: "Test lobby",
        maxPlayers: 4,
        private: false,
        hostId: 1,
        gameMode: GameMode.Audio,
        variant: "classic",
        status: "waiting",
        createdAt: now.toISOString(),
        matchId: "match-old",
        startAt: null,
        setupVersion: 0,
        notice: null,
        players: [player(1), player(2)],
        messages: [],
        ...overrides,
    };
    putLobby(lobby);
    return lobby;
}

function loginAs(userId: number): void {
    authSessionMock.mockImplementation(async () => sessionFor(userId));
}

function setPresent(userIds: number[]): void {
    presence.set(lobbyCode, new Set(userIds));
}

async function storedLobby(): Promise<MultiplayerLobby> {
    return (await readMultiplayerLobby(lobbyCode))!;
}

async function startReadyLobby(): Promise<MultiplayerLobby> {
    seedLobby({ players: [player(1), player(2, { ready: true })] });
    setPresent([1, 2]);
    loginAs(1);
    return startMultiplayerLobbyAction(lobbyCode);
}

beforeEach(() => {
    redisValues.clear();
    redisSets.clear();
    presence.clear();
    authSessionMock.mockReset().mockImplementation(async () => sessionFor(1));
    acquireRedisLockMock.mockClear();
    releaseRedisLockMock.mockClear();
    getPresentMultiplayerUsersMock.mockClear();
    publishMultiplayerLobbyMock.mockClear();
    publishMultiplayerLobbyDeletedMock.mockClear();
    publishMultiplayerBrowserChangedMock.mockClear();
    redisClientMock.get.mockClear();
    redisClientMock.set.mockClear();
    redisClientMock.eval.mockClear();
    redisClientMock.sAdd.mockClear();
    redisClientMock.sRem.mockClear();
    redisClientMock.sMembers.mockClear();
    redisClientMock.del.mockClear();
    setSystemTime(now);
});

afterEach(() => setSystemTime());

describe("multiplayer pre-game lifecycle", () => {
    test("adds a join event to lobby chat", async () => {
        seedLobby({ players: [player(1)] });
        loginAs(2);

        await joinMultiplayerLobbyAction(lobbyCode);
        await addMultiplayerMessage(lobbyCode, 2, "hey");

        const lobby = await storedLobby();
        expect(lobby.messages).toHaveLength(2);
        expect(lobby.messages[0]).toMatchObject({
            userId: 2,
            username: "Player 2",
            message: "joined the lobby.",
            kind: "join",
        });
        expect(lobby.messages[1]).toMatchObject({
            userId: 2,
            username: "Player 2",
            message: "hey",
        });
    });

    test("rejects guests from starting, changing settings, or resetting a lobby", async () => {
        seedLobby({ status: "finished" });
        authSessionMock.mockRejectedValue(new Error("Unauthorized"));

        await expect(startMultiplayerLobbyAction(lobbyCode)).rejects.toThrow("Unauthorized");
        await expect(updateMultiplayerLobbyAction(lobbyCode, {
            name: "Changed",
            maxPlayers: 4,
            private: false,
            gameMode: GameMode.Audio,
            variant: "classic",
        })).rejects.toThrow("Unauthorized");
        await expect(resetMultiplayerLobbyAction(lobbyCode)).rejects.toThrow("Unauthorized");
        expect(acquireRedisLockMock).not.toHaveBeenCalled();
    });

    test.each([
        ["an unready player", [1, 2], false, "Waiting for all players to ready up"],
        ["an offline player", [1], true, "Waiting for all players to connect"],
    ])("blocks start when there is %s", async (_reason, present, ready, message) => {
        seedLobby({ players: [player(1), player(2, { ready })] });
        setPresent(present);
        loginAs(1);

        await expect(startMultiplayerLobbyAction(lobbyCode)).rejects.toThrow(message);
        expect((await storedLobby()).status).toBe("waiting");
    });

    test("requires the current setupVersion before acknowledging readiness", async () => {
        seedLobby({ setupVersion: 2 });
        setPresent([2]);
        loginAs(2);

        await expect(setMultiplayerReadyAction(lobbyCode, true, 1)).rejects.toThrow("Setup changed");
        expect((await storedLobby()).players[1]?.ready).toBe(false);

        const readyLobby = await setMultiplayerReadyAction(lobbyCode, true, 2);
        expect(readyLobby.players[1]?.ready).toBe(true);
    });

    test("resets readiness only for gameplay changes, while renaming preserves it", async () => {
        seedLobby({ setupVersion: 3, players: [player(1, { ready: true }), player(2, { ready: true })] });
        loginAs(1);

        const renamed = await updateMultiplayerLobbyAction(lobbyCode, {
            name: "Renamed lobby",
            maxPlayers: 6,
            private: true,
            gameMode: GameMode.Audio,
            variant: "classic",
        });
        expect(renamed.setupVersion).toBe(3);
        expect(renamed.players.every((item) => item.ready)).toBe(true);

        const changedMode = await updateMultiplayerLobbyAction(lobbyCode, {
            name: "Renamed lobby",
            maxPlayers: 6,
            private: true,
            gameMode: GameMode.Skin,
            variant: "classic",
        });
        expect(changedMode.setupVersion).toBe(4);
        expect(changedMode.players.every((item) => !item.ready)).toBe(true);
        expect(changedMode.notice).toBeNull();
        expect(changedMode.messages.at(-1)).toMatchObject({
            message: "Setup changed. Ready up again.",
            kind: "system",
        });

        putLobby({ ...changedMode, players: changedMode.players.map((item) => ({ ...item, ready: true })) });
        const changedVariant = await updateMultiplayerLobbyAction(lobbyCode, {
            name: "Renamed lobby",
            maxPlayers: 6,
            private: true,
            gameMode: GameMode.Skin,
            variant: "survival",
        });
        expect(changedVariant.setupVersion).toBe(5);
        expect(changedVariant.players.every((item) => !item.ready)).toBe(true);
    });

    test("starts a three-second countdown and enters playing at its deadline", async () => {
        const started = await startReadyLobby();

        expect(started.status).toBe("starting");
        expect(started.startAt).toBe(now.getTime() + 3_000);
        expect(started.matchId).not.toBe("match-old");

        setSystemTime(new Date(started.startAt!));
        await finishMultiplayerCountdown(lobbyCode);

        const playing = await storedLobby();
        expect(playing.status).toBe("playing");
        expect(playing.startAt).toBe(started.startAt);
        expect(playing.players.map((item) => ({ points: item.points, round: item.round, submittedRound: item.submittedRound, readyRound: item.readyRound, finished: item.finished }))).toEqual([
            { points: 0, round: 1, submittedRound: 0, readyRound: 0, finished: false },
            { points: 0, round: 1, submittedRound: 0, readyRound: 0, finished: false },
        ]);
    });

    test("cancels a countdown when readiness is withdrawn", async () => {
        const started = await startReadyLobby();
        loginAs(2);

        const cancelled = await setMultiplayerReadyAction(lobbyCode, false, started.setupVersion);

        expect(cancelled.status).toBe("waiting");
        expect(cancelled.startAt).toBeNull();
        expect(cancelled.players[1]?.ready).toBe(false);
    });

    test("cancels a countdown when a player leaves", async () => {
        await startReadyLobby();
        loginAs(2);

        await leaveMultiplayerLobbyAction(lobbyCode);

        const lobby = await storedLobby();
        expect(lobby.status).toBe("waiting");
        expect(lobby.startAt).toBeNull();
        expect(lobby.players.map((item) => item.userId)).toEqual([1]);
    });

    test("cancels a countdown when a player disconnects", async () => {
        await startReadyLobby();
        setPresent([1]);

        await disconnectMultiplayerPlayer(lobbyCode, 2);

        const lobby = await storedLobby();
        expect(lobby.status).toBe("waiting");
        expect(lobby.startAt).toBeNull();
        expect(lobby.players.map((item) => item.userId)).toEqual([1]);
    });

    test("removes a disconnected player from the pre-game lobby", async () => {
        seedLobby({ players: [player(1), player(2, { ready: true })] });
        setPresent([1]);

        await disconnectMultiplayerPlayer(lobbyCode, 2);

        const lobby = await storedLobby();
        expect(lobby.status).toBe("waiting");
        expect(lobby.players.map((item) => item.userId)).toEqual([1]);
        expect(lobby.messages.at(-1)).toMatchObject({
            userId: 2,
            username: "Player 2",
            message: "left the lobby.",
            kind: "leave",
        });
    });

    test("transfers host when the host disconnects", async () => {
        seedLobby({ players: [player(1), player(2, { ready: true })] });
        setPresent([2]);

        await disconnectMultiplayerPlayer(lobbyCode, 1);

        const lobby = await storedLobby();
        expect(lobby.hostId).toBe(2);
        expect(lobby.players.map((item) => item.userId)).toEqual([2]);
    });

    test("preserves a completed host result while transferring host to a connected player", async () => {
        seedLobby({
            status: "finished",
            players: [
                player(1, { points: 500, scoreSessionId: "score-host", finished: true, completedMatch: true }),
                player(2, { points: 300, scoreSessionId: "score-guest", finished: true, completedMatch: true }),
            ],
        });
        setPresent([2]);

        await cleanupDisconnectedMultiplayerPlayer(lobbyCode, 1);

        const lobby = await storedLobby();
        expect(lobby.hostId).toBe(2);
        expect(lobby.players.find((item) => item.userId === 1)).toMatchObject({
            points: 500,
            scoreSessionId: "score-host",
            completedMatch: true,
        });
    });

    test("resets a finished match while preserving lobby identity and messages", async () => {
        const originalPlayers = [
            player(1, { points: 120, round: 15, submittedRound: 15, readyRound: 15, scoreSessionId: "score-host", finished: true, completedMatch: true, ready: true }),
            player(2, { points: 80, round: 15, submittedRound: 15, readyRound: 15, scoreSessionId: "score-guest", finished: true, completedMatch: true, ready: true }),
        ];
        const messages = [{ id: "message-1", userId: 2, username: "Player 2", message: "Good game", sentAt: now.toISOString() }];
        seedLobby({
            name: "Finished room",
            maxPlayers: 6,
            private: true,
            gameMode: GameMode.ScorePp,
            variant: "survival",
            status: "finished",
            matchId: "match-finished",
            setupVersion: 4,
            players: originalPlayers,
            messages,
        });
        loginAs(1);

        const reset = await resetMultiplayerLobbyAction(lobbyCode);

        expect(reset).toMatchObject({
            code: lobbyCode,
            name: "Finished room",
            maxPlayers: 6,
            private: true,
            gameMode: GameMode.ScorePp,
            variant: "survival",
            status: "waiting",
            startAt: null,
            setupVersion: 5,
            messages,
        });
        expect(reset.matchId).not.toBe("match-finished");
        expect(reset.players.map((item) => ({ userId: item.userId, username: item.username, joinedAt: item.joinedAt }))).toEqual(
            originalPlayers.map((item) => ({ userId: item.userId, username: item.username, joinedAt: item.joinedAt })),
        );
        expect(reset.players.every((item) => item.points === 0 && item.round === 0 && item.submittedRound === 0 && item.readyRound === 0 && item.scoreSessionId === null && !item.finished && !item.completedMatch && !item.ready)).toBe(true);
    });

    test("ignores progress submitted with an old matchId", async () => {
        seedLobby({
            status: "playing",
            matchId: "match-current",
            players: [player(1), player(2, { points: 20, round: 2 })],
        });

        await updateMultiplayerProgress(lobbyCode, 2, {
            points: 999,
            round: 15,
            submittedRound: 15,
            readyRound: 15,
            finished: true,
        }, "match-old");

        const lobby = await storedLobby();
        expect(lobby.status).toBe("playing");
        expect(lobby.players[1]).toMatchObject({ points: 20, round: 2, submittedRound: 0, readyRound: 0, finished: false });
    });

    test("records completed results after the lobby has already finished", async () => {
        seedLobby({
            status: "finished",
            matchId: "match-current",
            players: [player(1, { finished: true }), player(2, { finished: true })],
        });

        await updateMultiplayerProgress(lobbyCode, 2, {
            points: 80,
            round: 15,
            scoreSessionId: "score-guest",
            results: { correct: 8, incorrect: 3, skipped: 2, timedOut: 2 },
            finished: true,
            completedMatch: true,
        }, "match-current");

        const lobby = await storedLobby();
        expect(lobby.players[1].results).toEqual({ correct: 8, incorrect: 3, skipped: 2, timedOut: 2 });
        expect(lobby.players[1]).toMatchObject({ points: 80, round: 15, scoreSessionId: "score-guest", finished: true, completedMatch: true });
    });
});
