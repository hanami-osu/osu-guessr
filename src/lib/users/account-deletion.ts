import type { PrismaClient } from "@/generated/prisma/client";

type DeletionTransaction = Pick<PrismaClient, "gameRound" | "game" | "userAchievement" | "userBadge" | "apiKey" | "report" | "contentStatContribution" | "gameChallenge" | "user">;

export interface AccountDeletionDependencies {
    prisma: Pick<PrismaClient, "user"> & { $transaction<T>(operation: (tx: DeletionTransaction) => Promise<T>): Promise<T> };
    redis: { del(keys: string[]): Promise<unknown> };
    removeMultiplayerUser(userId: number): Promise<void>;
    now?: () => Date;
    logError?: (message: string, error: unknown) => void;
}

export type AccountDeletionAction = "hide" | "restore" | "purge";

export function createAccountDeletionService(dependencies: AccountDeletionDependencies) {
    const logError = dependencies.logError ?? ((message, error) => console.error(message, error));

    async function hideUser(userId: number): Promise<void> {
        await dependencies.prisma.user.updateMany({
            where: { banchoId: userId, deletionScheduledAt: null },
            data: { deletionScheduledAt: dependencies.now?.() ?? new Date() },
        });

        // Hidden users already lose their session, so a stale lobby entry is inert and expires on its own.
        try {
            await dependencies.removeMultiplayerUser(userId);
        } catch (error) {
            logError(`Failed to remove hidden user ${userId} from multiplayer:`, error);
        }
    }

    async function restoreUser(userId: number): Promise<void> {
        await dependencies.prisma.user.updateMany({
            where: { banchoId: userId },
            data: { deletionScheduledAt: null },
        });
    }

    async function purgeUser(userId: number): Promise<void> {
        await dependencies.prisma.$transaction(async (tx) => {
            await tx.gameRound.deleteMany({ where: { game: { userId } } });
            await tx.game.deleteMany({ where: { userId } });
            await tx.userAchievement.deleteMany({ where: { userId } });
            await tx.userBadge.deleteMany({ where: { userId } });
            await tx.apiKey.deleteMany({ where: { userId } });
            await tx.report.deleteMany({ where: { userId } });
            await tx.contentStatContribution.deleteMany({ where: { userId } });
            await tx.gameChallenge.updateMany({ where: { creatorUserId: userId }, data: { creatorUserId: null } });
            await tx.user.deleteMany({ where: { banchoId: userId } });
        });

        await dependencies.removeMultiplayerUser(userId);
        await dependencies.redis.del([`report_rate:${userId}`]);
    }

    return {
        hideUser,
        restoreUser,
        purgeUser,
        run(action: AccountDeletionAction, userId: number): Promise<void> {
            if (action === "hide") return hideUser(userId);
            if (action === "restore") return restoreUser(userId);
            return purgeUser(userId);
        },
    };
}
