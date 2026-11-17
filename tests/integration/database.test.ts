import { afterAll, beforeAll, describe, expect, mock, setSystemTime, test } from "bun:test";
import { createHash } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { createAccountDeletionService } from "@/lib/users/account-deletion";

const databaseUrl = process.env.OSU_GUESSR_TEST_DATABASE_URL;
const secret = "test-account-deletion-integration-secret";

describe.skipIf(!databaseUrl)("application behavior with MariaDB", () => {
    let prisma: PrismaClient;
    let getStats: typeof import("@/app/api/stats/route").GET;
    let deleteAccountData: typeof import("@/app/api/internal/account-deletion/route").POST;
    let getAnalytics: typeof import("@/lib/analytics/queries").getAnalytics;

    beforeAll(async () => {
        prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl!) });
        const [users, games] = await Promise.all([prisma.user.count(), prisma.game.count()]);
        if (users || games) throw new Error("Use a fresh migrated database for the integration tests.");

        mock.module("server-only", () => ({}));
        mock.module("@/lib/database/prisma", () => ({ prisma }));
        mock.module("@/lib/infra/env", () => ({ env: { HANAMI_INTERNAL_SECRET: secret } }));
        mock.module("@/lib/infra/redis", () => ({ default: { incr: async () => 1, expire: async () => 1, del: async () => 1 } }));
        mock.module("@/lib/multiplayer/multiplayer", () => ({ removeMultiplayerUser: async () => {} }));
        mock.module("@/actions/server", () => ({
            authenticatedAction: () => {
                throw new Error("Unexpected authenticated action");
            },
        }));

        ({ GET: getStats } = await import("@/app/api/stats/route"));
        ({ POST: deleteAccountData } = await import("@/app/api/internal/account-deletion/route"));
        ({ getAnalytics } = await import("@/lib/analytics/queries"));
    });

    afterAll(async () => {
        await prisma?.$disconnect();
    });

    function pushDeletion(banchoId: number, action: "hide" | "restore" | "purge") {
        return deleteAccountData(
            new Request("http://localhost/api/internal/account-deletion", {
                method: "POST",
                headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
                body: JSON.stringify({ banchoId, action }),
            }),
        );
    }

    function requestStats(apiKey: string) {
        return getStats(new Request("http://localhost/api/stats", { headers: { "X-API-Key": apiKey } }));
    }

    test("a deletion request immediately revokes API access and restoring it reactivates the same key", async () => {
        const userId = 101;
        const apiKey = "test-owner-key";
        const hashedKey = createHash("sha256").update(apiKey).digest("hex");
        await prisma.user.create({ data: { banchoId: userId, username: "API user", avatarUrl: "" } });
        await prisma.apiKey.create({ data: { id: hashedKey, userId, name: "Owner key" } });
        await prisma.apiKey.create({
            data: { id: createHash("sha256").update("test-orphan-key").digest("hex"), userId: 999, name: "Key without an owner" },
        });

        expect((await requestStats(apiKey)).status).toBe(200);
        expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: hashedKey } })).lastUsed).toBeInstanceOf(Date);
        expect((await requestStats("test-orphan-key")).status).toBe(403);

        expect((await pushDeletion(userId, "hide")).status).toBe(200);
        expect((await requestStats(apiKey)).status).toBe(403);
        expect((await pushDeletion(userId, "restore")).status).toBe(200);
        expect((await requestStats(apiKey)).status).toBe(200);
    });

    async function saveGame(userId: number, endedAt: Date, roundCount = 1) {
        return prisma.game.create({
            data: {
                userId,
                gameMode: "audio",
                roundsPlayed: roundCount,
                correctCount: 1,
                startedAt: new Date(endedAt.getTime() - 60_000),
                endedAt,
                rounds: {
                    create: Array.from({ length: roundCount }, (_, index) => ({
                        roundNumber: index + 1,
                        itemType: "mapset",
                        itemId: 700,
                        answerSnapshot: "Asymmetry",
                        resultType: "guess",
                        submittedGuess: index === 0 ? "Asymmetry" : "  REOL  ",
                        correct: index === 0,
                        responseTimeMs: 3000,
                        timeLimitMs: 30_000,
                        contentSnapshot: { artist: "Reol" },
                    })),
                },
            },
        });
    }

    test("purge rolls back when the last write fails, then a retry removes only the target's data", async () => {
        const userId = 201;
        const otherId = 202;
        const challengeId = crypto.randomUUID();
        await prisma.user.createMany({
            data: [
                { banchoId: userId, username: "Deleted player", avatarUrl: "" },
                { banchoId: otherId, username: "Other player", avatarUrl: "" },
            ],
        });
        const endedAt = new Date("2025-01-01T00:00:00Z");
        const target = await saveGame(userId, endedAt);
        const other = await saveGame(otherId, endedAt);
        await prisma.report.create({ data: { userId, mapsetId: 700, reportType: "wrong_audio" } });
        await prisma.apiKey.create({ data: { id: "purge-fixture-key", userId, name: "Key to purge" } });
        await prisma.userAchievement.create({ data: { userId, gameMode: "audio" } });
        await prisma.userBadge.create({ data: { userId, badgeName: "Supporter" } });
        await prisma.contentStatContribution.create({
            data: { userId, gameMode: "audio", itemType: "mapset", itemId: 700, rulesetVersion: 1, ppVersion: 1, correct: true, resultType: "guess", responseTimeMs: 1000 },
        });
        const statKey = { gameMode: "audio", itemType: "mapset", itemId: 700, rulesetVersion: 1, ppVersion: 1 } as const;
        await prisma.contentStat.create({ data: { ...statKey, appearances: 2 } });
        await prisma.gameChallenge.create({
            data: { id: challengeId, creatorUserId: userId, challengeType: "shared", gameMode: "audio", rulesetVersion: 1, ppVersion: 1, seed: "fixture" },
        });

        const removeMultiplayerUser = mock(async () => {});
        const failLastWrite = prisma.$extends({
            query: {
                user: {
                    async deleteMany() {
                        throw new Error("Final write failed");
                    },
                },
            },
        });
        const failingPurge = createAccountDeletionService({
            prisma: {
                user: prisma.user,
                $transaction: (operation) => failLastWrite.$transaction((tx) => operation(tx as unknown as Prisma.TransactionClient)),
            },
            redis: { del: async () => 1 },
            removeMultiplayerUser,
        });
        await expect(failingPurge.purgeUser(userId)).rejects.toThrow("Final write failed");
        expect(await prisma.game.count({ where: { id: target.id } })).toBe(1);
        expect(await prisma.gameRound.count({ where: { gameId: target.id } })).toBe(1);
        expect((await prisma.gameChallenge.findUniqueOrThrow({ where: { id: challengeId } })).creatorUserId).toBe(userId);
        expect(removeMultiplayerUser).not.toHaveBeenCalled();

        expect((await pushDeletion(userId, "purge")).status).toBe(200);
        expect((await pushDeletion(userId, "purge")).status).toBe(200);
        expect(await prisma.user.findUnique({ where: { banchoId: userId } })).toBeNull();
        expect(await prisma.game.findUnique({ where: { id: target.id } })).toBeNull();
        expect(await prisma.gameRound.count({ where: { gameId: target.id } })).toBe(0);
        expect(await prisma.report.count({ where: { userId } })).toBe(0);
        expect(await prisma.apiKey.count({ where: { userId } })).toBe(0);
        expect(await prisma.userAchievement.count({ where: { userId } })).toBe(0);
        expect(await prisma.userBadge.count({ where: { userId } })).toBe(0);
        expect(await prisma.contentStatContribution.count({ where: { userId } })).toBe(0);
        expect((await prisma.contentStat.findUniqueOrThrow({ where: { gameMode_itemType_itemId_rulesetVersion_ppVersion: statKey } })).appearances).toBe(2n);
        expect(await prisma.gameRound.count({ where: { gameId: other.id } })).toBe(1);
        expect((await prisma.gameChallenge.findUniqueOrThrow({ where: { id: challengeId } })).creatorUserId).toBeNull();
    });

    test("analytics uses rounds from games in the selected period and groups repeated wrong guesses", async () => {
        setSystemTime(new Date("2026-11-28T12:00:00Z"));
        try {
            await saveGame(301, new Date("2026-11-27T12:00:00Z"), 3);
            await saveGame(302, new Date("2026-11-20T12:00:00Z"), 3);
            await prisma.gameRound.create({
                data: {
                    gameId: 999_999n,
                    roundNumber: 1,
                    itemType: "mapset",
                    itemId: 700,
                    answerSnapshot: "Orphaned round",
                    correct: true,
                    resultType: "guess",
                    responseTimeMs: 1,
                },
            });

            const data = await getAnalytics("7d");
            expect(data.overview.kpis).toMatchObject({ games: 1, players: 1, rounds: 3, accuracy: 1 / 3, avgDurationSeconds: 60 });
            expect(data.overview.previousKpis).toMatchObject({ games: 1, rounds: 3 });
            expect(data.rounds.resultMix).toEqual([{ gameMode: "audio", correct: 1, wrong: 2, skipped: 0, timedOut: 0 }]);
            expect(data.content.items).toMatchObject([{ itemId: 700, appearances: 3, accuracy: 1 / 3 }]);
            expect(data.content.wrongGuesses.artistConfusions).toMatchObject([{ itemId: 700, guess: "reol", count: 2 }]);
        } finally {
            setSystemTime();
        }
    });
});
