import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createAccountDeletionService, type AccountDeletionDependencies } from "@/lib/users/account-deletion";

const userId = 7;
const scheduledAt = new Date("2026-11-16T00:00:00.000Z");
let users: Map<number, Date | null>;

function service(now = scheduledAt) {
    const removeMultiplayerUser = mock<(id: number) => Promise<void>>(async () => {});
    const logError = mock<(message: string, error: unknown) => void>(() => {});
    const updateMany = async ({ where, data }: { where: { banchoId: number; deletionScheduledAt?: null }; data: { deletionScheduledAt: Date | null } }) => {
        const current = users.get(where.banchoId);
        if (current === undefined || (where.deletionScheduledAt === null && current !== null)) return { count: 0 };
        users.set(where.banchoId, data.deletionScheduledAt);
        return { count: 1 };
    };
    const accountDeletion = createAccountDeletionService({
        prisma: {
            user: { updateMany } as unknown as AccountDeletionDependencies["prisma"]["user"],
            $transaction: async () => {
                throw new Error("Unexpected transaction for hide or restore");
            },
        },
        redis: { del: async () => 1 },
        removeMultiplayerUser,
        now: () => now,
        logError,
    });
    return { accountDeletion, removeMultiplayerUser, logError };
}

beforeEach(() => {
    users = new Map([
        [userId, null],
        [userId + 1, null],
    ]);
});

describe("account deletion visibility", () => {
    test("hides a user once and removes them from multiplayer", async () => {
        const { accountDeletion, removeMultiplayerUser } = service();
        await accountDeletion.run("hide", userId);
        await service(new Date("2026-11-20T00:00:00.000Z")).accountDeletion.hideUser(userId);

        expect(users.get(userId)).toEqual(scheduledAt);
        expect(users.get(userId + 1)).toBeNull();
        expect(removeMultiplayerUser).toHaveBeenCalledWith(userId);
    });

    test("hides the account even if multiplayer cleanup fails", async () => {
        const { accountDeletion, removeMultiplayerUser, logError } = service();
        removeMultiplayerUser.mockRejectedValueOnce(new Error("Redis unavailable"));

        await accountDeletion.hideUser(userId);

        expect(users.get(userId)).toEqual(scheduledAt);
        expect(logError).toHaveBeenCalledTimes(1);
    });

    test("restores a hidden user and tolerates repeats or a missing user", async () => {
        const { accountDeletion } = service();
        users.set(userId, scheduledAt);

        await accountDeletion.run("restore", userId);
        await accountDeletion.run("restore", userId);
        await accountDeletion.run("hide", 99);
        await accountDeletion.run("restore", 99);

        expect(users.get(userId)).toBeNull();
        expect(users.has(99)).toBe(false);
    });
});
