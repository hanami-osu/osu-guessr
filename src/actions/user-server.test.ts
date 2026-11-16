import { beforeEach, describe, expect, mock, test } from "bun:test";
import { GameMode } from "./types";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const visibleId = 1;
const hiddenId = 2;
const otherVisibleId = 3;

function matchesCondition(value: unknown, condition: unknown): boolean {
    if (condition === null || typeof condition !== "object" || condition instanceof Date) return value === condition;
    const operators = condition as Record<string, unknown>;
    if ("not" in operators && value === operators.not) return false;
    if ("in" in operators && !(operators.in as unknown[]).includes(value)) return false;
    if ("notIn" in operators && (operators.notIn as unknown[]).includes(value)) return false;
    if ("contains" in operators && !String(value).includes(String(operators.contains))) return false;
    if ("gt" in operators && !(Number(value) > Number(operators.gt))) return false;
    return true;
}

function filter(rows: Row[], where: Where = {}): Row[] {
    return rows.filter((row) => Object.entries(where).every(([key, condition]) => matchesCondition(row[key], condition)));
}

function userRow(banchoId: number, deletionScheduledAt: Date | null): Row {
    return { banchoId, username: `player${banchoId}`, avatarUrl: "", bannerUrl: null, isAdmin: false, deletionScheduledAt, createdAt: new Date(0) };
}

function achievementRow(userId: number, profilePp: number): Row {
    return {
        userId,
        gameMode: GameMode.Background,
        variant: "classic",
        rulesetVersion: CURRENT_RULESET_VERSION,
        ppVersion: CURRENT_PP_VERSION,
        totalScore: 0,
        gamesPlayed: 1,
        roundsPlayed: 1,
        totalCorrect: 1,
        totalSkips: 0,
        totalTimeouts: 0,
        totalResponseTimeMs: 0,
        highestStreak: 1,
        highestScore: 1,
        bestRunPp: profilePp,
        profilePp,
        lastPlayed: new Date(0),
    };
}

const users = [userRow(visibleId, null), userRow(hiddenId, new Date()), userRow(otherVisibleId, null)];
// The hidden player has the most pp, so leaking them would push everyone else down a rank.
const achievements = [achievementRow(visibleId, 100), achievementRow(hiddenId, 500), achievementRow(otherVisibleId, 50)];

const gameFindManyMock = mock(async (args: { where?: Where }) => {
    void args;
    return [] as Row[];
});
const gameCountMock = mock(async () => 4);
const queryMock = mock(async () => [] as Row[]);

const prismaMock = {
    user: {
        findFirst: mock(async ({ where }: { where: Where }) => filter(users, where)[0] ?? null),
        findMany: mock(async ({ where, take }: { where: Where; take?: number }) => filter(users, where).slice(0, take)),
        count: mock(async (args?: { where?: Where }) => filter(users, args?.where).length),
    },
    userAchievement: {
        findMany: mock(async ({ where }: { where: Where }) => filter(achievements, where)),
        count: mock(async ({ where }: { where: Where }) => filter(achievements, where).length),
    },
    userBadge: { findMany: mock(async () => []) },
    badge: { findMany: mock(async () => []) },
    game: {
        findMany: gameFindManyMock,
        count: gameCountMock,
        aggregate: mock(async () => ({ _count: { _all: 4 }, _sum: { points: 10 }, _avg: { streak: 1 }, _max: { points: 5, streak: 2, endedAt: new Date(0), pp: 9 } })),
    },
};

mock.module("./server", () => ({ authenticatedAction: mock() }));
mock.module("@/lib/database/prisma", () => ({ prisma: prismaMock }));
mock.module("@/lib/database/database", () => ({ query: queryMock }));

const actions = await import("./user-server");

beforeEach(() => {
    gameFindManyMock.mockClear();
    gameCountMock.mockClear();
});

describe("users scheduled for deletion", () => {
    test("are not found by id", async () => {
        expect(await actions.getUserByIdAction(hiddenId)).toBeNull();
    });

    test("do not count towards a visible user's ranks", async () => {
        const user = await actions.getUserByIdAction(visibleId);

        expect(user?.ranks?.globalRank?.classic).toBe(1);
        expect(user?.ranks?.modeRanks[GameMode.Background].classic).toBe(1);
    });

    test("have no public stats, games, rank history or top games", async () => {
        expect(await actions.getUserStatsAction(hiddenId)).toEqual([]);
        expect(await actions.getUserLatestGamesAction(hiddenId)).toEqual([]);
        expect(await actions.getUserGamesCountAction(hiddenId)).toBe(0);
        expect(await actions.getUserTopGamesAction(hiddenId)).toEqual([]);
        expect(await actions.getUserRankHistoryAction(hiddenId, GameMode.Background)).toEqual([]);
        expect(await actions.getUserLifetimeModeStatsAction(hiddenId, GameMode.Background)).toMatchObject({ games_played: 0, last_played: null });
        expect(gameFindManyMock).not.toHaveBeenCalled();
        expect(gameCountMock).not.toHaveBeenCalled();
    });

    test("do not count towards a visible user's rank history", async () => {
        queryMock.mockImplementationOnce(async () => [
            { user_id: hiddenId, pp: 500 },
            { user_id: visibleId, pp: 100 },
        ]);

        const history = await actions.getUserRankHistoryAction(visibleId, GameMode.Background, "classic", 3);

        expect(history.map((point) => point.rank)).toEqual([1, 1, 1]);
        expect(gameFindManyMock).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { notIn: [hiddenId] } }) }));
    });

    test("leave visible users' games readable", async () => {
        expect(await actions.getUserGamesCountAction(visibleId)).toBe(4);
    });

    test("are excluded from the leaderboard query so pages stay full", async () => {
        const players = await actions.getTopPlayersAction(GameMode.Background, "classic", 2);

        expect(players.map((player) => player.bancho_id)).toEqual([visibleId, otherVisibleId]);
        expect(prismaMock.userAchievement.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { notIn: [hiddenId] } }) }));
    });

    test("do not appear in search", async () => {
        expect((await actions.searchUsersAction("player")).map((user) => user.bancho_id)).toEqual([visibleId, otherVisibleId]);
        expect(await actions.searchUsersPageAction("player")).toMatchObject({ total: 2 });
    });

    test("do not count towards the total number of users", async () => {
        expect((await actions.getHighestStatsAction()).total_users).toBe(2);
    });
});
