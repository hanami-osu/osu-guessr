import { expect, mock, test } from "bun:test";
import type { MultiplayerLobby, MultiplayerPlayer } from "./multiplayer";

const publish = mock<(channel: string, message: string) => Promise<number>>(async () => 1);
const redisValues = new Map<string, string>();
const redis = {
    publish,
    async *scanIterator({ MATCH }: { MATCH: string }) {
        const prefix = MATCH.replace(/\*$/, "");
        yield [...redisValues.keys()].filter((key) => key.startsWith(prefix));
    },
    mGet: async (keys: string[]) => keys.map((key) => redisValues.get(key) ?? null),
    del: async (keys: string[]) => keys.filter((key) => redisValues.delete(key)).length,
};
mock.module("@/lib/infra/redis", () => ({ default: redis }));
const { publishMultiplayerLobby, revokeMultiplayerSocketTokens } = await import("./multiplayer-realtime");

test("revokes only the socket tokens that belong to the user", async () => {
    redisValues.set("multiplayer_socket_token:a", "7");
    redisValues.set("multiplayer_socket_token:b", "8");
    redisValues.set("multiplayer_socket_token:c", "7");
    redisValues.set("multiplayer_user_lobby:7", "ROOM123");

    await revokeMultiplayerSocketTokens(7);

    expect([...redisValues.keys()]).toEqual(["multiplayer_socket_token:b", "multiplayer_user_lobby:7"]);
});

test("broadcasts indistinguishable pending Score PP outcomes and reveals them after all submissions", async () => {
    const player: MultiplayerPlayer = {
        userId: 1,
        username: "Player",
        avatarUrl: null,
        joinedAt: "2026-01-01T00:00:00.000Z",
        points: 315,
        round: 2,
        submittedRound: 2,
        readyRound: 1,
        resultRound: 2,
        resultCorrect: true,
        resultSkipped: false,
        resultPoints: 165,
        scoreSessionId: "00000000-0000-4000-8000-000000000001",
        finished: false,
        completedMatch: false,
        ready: false,
    };
    const lobby: MultiplayerLobby = {
        code: "ROOM123",
        name: "Test lobby",
        maxPlayers: 2,
        private: false,
        hostId: 1,
        gameMode: "score_pp" as MultiplayerLobby["gameMode"],
        variant: "survival",
        status: "playing",
        createdAt: player.joinedAt,
        matchId: "match-1",
        startAt: null,
        setupVersion: 0,
        notice: null,
        players: [player, { ...player, userId: 2, submittedRound: 1, resultRound: 1 }],
        messages: [],
    };

    await publishMultiplayerLobby(lobby);
    const correctPending = JSON.parse(publish.mock.calls.at(-1)![1]);
    expect(correctPending.lobby.players[0]).toMatchObject({ points: 150, resultCorrect: null, resultPoints: 0, scoreSessionId: null });

    lobby.players[0] = { ...player, points: 100, resultCorrect: false, resultPoints: -50, finished: true, completedMatch: true };
    await publishMultiplayerLobby(lobby);
    expect(JSON.parse(publish.mock.calls.at(-1)![1])).toEqual(correctPending);

    lobby.players[0] = player;
    lobby.players[1].submittedRound = 2;
    await publishMultiplayerLobby(lobby);
    expect(JSON.parse(publish.mock.calls.at(-1)![1]).lobby.players[0]).toMatchObject({ points: 315, resultCorrect: true, resultPoints: 165 });
});
