import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
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

const dailyAttempts: Row[] = [];
const dailyGames: Row[] = [];
const prismaMock = {
    dailyGameAttempt: { findMany: mock(async ({ where }: { where?: Where }) => filter(dailyAttempts, where)) },
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


describe("daily participation", () => {
    beforeEach(() => {
        setSystemTime(new Date("2026-11-20T12:00:00Z"));
        dailyAttempts.length = 0;
        dailyGames.length = 0;
        for (const [index, [date, gameMode]] of [
            ["2026-11-18", GameMode.Background],
            ["2026-11-19", GameMode.Audio],
            ["2026-11-19", GameMode.Background],
        ].entries()) {
            const sessionId = `daily-${index}`;
            dailyAttempts.push({ userId: visibleId, dailyDate: new Date(`${date}T00:00:00Z`), gameMode, sessionId });
            dailyGames.push({ userId: visibleId, gameMode, sessionId, runType: "daily", endReason: "completed", roundsPlayed: 5, correctCount: 5, points: 100, streak: 5, totalResponseTimeMs: 1000n, endedAt: new Date(`${date}T12:00:00Z`) });
        }
        gameFindManyMock.mockImplementation(async ({ where }) => filter(dailyGames, where));
    });
    afterEach(() => { setSystemTime(); gameFindManyMock.mockImplementation(async () => []); });

    test("combines modes for day streaks and leaves dates before the first daily blank", async () => {
        const stats = await actions.getUserDailyStatsAction(visibleId, GameMode.Background);
        expect(stats.best_streak).toBe(2);
        expect(stats.dailies_played).toBe(3);
        expect(stats.calendar).toEqual([
            { date: "2026-11-18", status: "perfect" },
            { date: "2026-11-19", status: "perfect" },
            { date: "2026-11-20", status: "today" },
        ]);
    });

    test("excludes hidden players and ranks participation without using points", async () => {
        dailyAttempts.push({ userId: hiddenId, gameMode: GameMode.Background, dailyDate: new Date("2026-11-19Z"), sessionId: "hidden-daily" });
        dailyGames.push({ ...dailyGames[0], userId: hiddenId, sessionId: "hidden-daily" });
        const players = await actions.getDailyTopPlayersAction(GameMode.Background);
        expect(players.map(player => player.bancho_id)).toEqual([visibleId]);
        expect(players[0]).toMatchObject({ best_daily_streak: 2, games_played: 3 });
    });
    test("offers separate rankings for day streaks and total completed dailies", async () => {
        for (const [index, gameMode] of Object.values(GameMode).entries()) {
            const sessionId = `other-${index}`;
            dailyAttempts.push({ userId: otherVisibleId, gameMode, sessionId, dailyDate: new Date("2026-11-19Z") });
            dailyGames.push({ ...dailyGames[0], userId: otherVisibleId, gameMode, sessionId, points: 10000 });
        }
        expect((await actions.getDailyTopPlayersAction(GameMode.Background)).map(player => player.bancho_id)).toEqual([visibleId, otherVisibleId]);
        expect((await actions.getDailyTopPlayersAction(GameMode.Background, 10, 0, "played")).map(player => player.bancho_id)).toEqual([otherVisibleId, visibleId]);
    });

});
