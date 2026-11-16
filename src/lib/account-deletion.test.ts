import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createAccountDeletionService, type AccountDeletionDependencies } from "./account-deletion";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const userId = 7;
const otherUserId = 8;
const scheduledAt = new Date("2026-11-16T00:00:00.000Z");

function matches(row: Row, where: Where): boolean {
    return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createTable(rows: Row[]) {
    return {
        rows,
        async deleteMany({ where }: { where: Where }) {
            const before = rows.length;
            rows.splice(0, rows.length, ...rows.filter((row) => !matches(row, where)));
            return { count: before - rows.length };
        },
        async updateMany({ where, data }: { where: Where; data: Row }) {
            const matched = rows.filter((row) => matches(row, where));
            for (const row of matched) Object.assign(row, data);
            return { count: matched.length };
        },
    };
}

function createDatabase() {
    const tables = {
        user: createTable([
            { banchoId: userId, deletionScheduledAt: null },
            { banchoId: otherUserId, deletionScheduledAt: null },
        ]),
        game: createTable([
            { id: 1, userId },
            { id: 2, userId: otherUserId },
        ]),
        gameRound: createTable([
            { gameId: 1, roundNumber: 1 },
            { gameId: 2, roundNumber: 1 },
        ]),
        userAchievement: createTable([{ userId }, { userId: otherUserId }]),
        userBadge: createTable([{ userId }, { userId: otherUserId }]),
        apiKey: createTable([{ userId }, { userId: otherUserId }]),
        report: createTable([{ userId }, { userId: otherUserId }]),
        contentStatContribution: createTable([{ userId }, { userId: otherUserId }]),
        gameChallenge: createTable([
            { id: "a", creatorUserId: userId },
            { id: "b", creatorUserId: otherUserId },
        ]),
        contentStat: createTable([{ itemId: 1, appearances: 2 }]),
    };

    const tx = {
        ...tables,
        async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
            expect(strings.join("?")).toContain("DELETE gr FROM game_rounds gr JOIN games g");
            const gameIds = new Set(tables.game.rows.filter((game) => game.userId === values[0]).map((game) => game.id));
            const rounds = tables.gameRound.rows;
            rounds.splice(0, rounds.length, ...rounds.filter((round) => !gameIds.has(round.gameId)));
            return 0;
        },
    };

    const transaction = mock(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx));
    return { tables, prisma: { user: tables.user, $transaction: transaction } };
}

let database: ReturnType<typeof createDatabase>;
let removeMultiplayerUser: ReturnType<typeof mock<(id: number) => Promise<void>>>;
let redisDel: ReturnType<typeof mock<(keys: string[]) => Promise<number>>>;
let logError: ReturnType<typeof mock<(message: string, error: unknown) => void>>;

function service() {
    return createAccountDeletionService({
        prisma: database.prisma as unknown as AccountDeletionDependencies["prisma"],
        redis: { del: redisDel },
        removeMultiplayerUser,
        now: () => scheduledAt,
        logError,
    });
}

function user(id: number) {
    return database.tables.user.rows.find((row) => row.banchoId === id);
}

beforeEach(() => {
    database = createDatabase();
    removeMultiplayerUser = mock(async () => {});
    redisDel = mock(async () => 1);
    logError = mock(() => {});
});

describe("account deletion", () => {
    test("hides a user and removes them from multiplayer", async () => {
        await service().run("hide", userId);

        expect(user(userId)?.deletionScheduledAt).toEqual(scheduledAt);
        expect(user(otherUserId)?.deletionScheduledAt).toBeNull();
        expect(removeMultiplayerUser).toHaveBeenCalledWith(userId);
    });

    test("keeps the first hide time when hide is repeated", async () => {
        await service().hideUser(userId);
        const later = createAccountDeletionService({
            prisma: database.prisma as unknown as AccountDeletionDependencies["prisma"],
            redis: { del: redisDel },
            removeMultiplayerUser,
            now: () => new Date("2026-11-20T00:00:00.000Z"),
        });

        await later.hideUser(userId);

        expect(user(userId)?.deletionScheduledAt).toEqual(scheduledAt);
    });

    test("still hides the user when multiplayer cleanup fails", async () => {
        removeMultiplayerUser.mockImplementation(async () => {
            throw new Error("redis unavailable");
        });

        await service().hideUser(userId);

        expect(user(userId)?.deletionScheduledAt).toEqual(scheduledAt);
        expect(logError).toHaveBeenCalledTimes(1);
    });

    test("restores a hidden user and tolerates repeats", async () => {
        await service().hideUser(userId);

        await service().run("restore", userId);
        await service().run("restore", userId);

        expect(user(userId)?.deletionScheduledAt).toBeNull();
    });

    test("purges every row of the user, anonymizes their challenges and keeps everyone else's data", async () => {
        const { tables } = database;

        await service().run("purge", userId);

        expect(user(userId)).toBeUndefined();
        expect(tables.game.rows).toEqual([{ id: 2, userId: otherUserId }]);
        expect(tables.gameRound.rows).toEqual([{ gameId: 2, roundNumber: 1 }]);
        for (const table of [tables.userAchievement, tables.userBadge, tables.apiKey, tables.report, tables.contentStatContribution]) {
            expect(table.rows).toEqual([{ userId: otherUserId }]);
        }
        expect(tables.gameChallenge.rows).toEqual([
            { id: "a", creatorUserId: null },
            { id: "b", creatorUserId: otherUserId },
        ]);
        expect(tables.contentStat.rows).toEqual([{ itemId: 1, appearances: 2 }]);
        expect(database.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(removeMultiplayerUser).toHaveBeenCalledWith(userId);
        expect(redisDel).toHaveBeenCalledWith([`report_rate:${userId}`]);
    });

    test("purge, hide and restore succeed when the user has no row", async () => {
        await service().purgeUser(userId);
        const snapshot = JSON.stringify(database.tables);

        await service().purgeUser(userId);
        await service().hideUser(userId);
        await service().restoreUser(userId);

        expect(JSON.stringify(database.tables)).toBe(snapshot);
        expect(user(userId)).toBeUndefined();
    });

    test("propagates purge failures so the caller retries", async () => {
        database.prisma.$transaction.mockImplementation(async () => {
            throw new Error("deadlock");
        });

        await expect(service().purgeUser(userId)).rejects.toThrow("deadlock");
        expect(redisDel).not.toHaveBeenCalled();
    });
});
