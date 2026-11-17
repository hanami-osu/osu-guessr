import { beforeEach, describe, expect, mock, test } from "bun:test";
import { GameMode } from "@/actions/types";

const selectedTags = [1, 2, 3, 4, 5].map((mapsetId) => ({ mapsetId, imageFilename: `${mapsetId}.webp`, audioFilename: `${mapsetId}.mp3` }));
function mapset(mapsetId: number) {
    return { mapsetId, title: `Song ${mapsetId}`, artist: "Artist", mapper: "Mapper", rankedAt: null, starRatingMin: null, starRatingMax: null };
}
const metadata = mock(async ({ where }: { where: { mapsetId: { in: number[] } } }) => where.mapsetId.in.map(mapset));
const scheduled = mock(async () => [] as { itemId: number }[]);
const played = mock(async () => [] as { itemId: number }[]);
type TestSkin = { id: number; name: string; imageFilename: string; createdAt: Date; updatedAt: Date };
const skinPool = mock(async () => [] as TestSkin[]);
const findSkin = mock(async (_args: { where: { id: number } }) => { void _args; return null as TestSkin | null; });
const challengeFindUniqueMock = mock(async () => null as { id: string } | null);
const challengeCreateMock = mock(async (args: { data: Record<string, unknown> }) => args.data);
const challengeRoundCreateManyMock = mock(async (args: { data: Array<Record<string, unknown>> }) => ({ count: args.data.length }));
const challengeRoundDeleteManyMock = mock(async () => ({ count: 5 }));
const challengeDeleteMock = mock(async () => ({}));
const challengeRoundFindUniqueMock = mock(async (_args: { where: { challengeId_roundNumber: { roundNumber: number } } }) => { void _args; return null as Record<string, unknown> | null; });
const transactionMock = mock(async (operation: (transaction: unknown) => Promise<unknown>) =>
    operation({
        gameChallenge: { create: challengeCreateMock, findUnique: challengeFindUniqueMock, delete: challengeDeleteMock },
        gameChallengeRound: { createMany: challengeRoundCreateManyMock, deleteMany: challengeRoundDeleteManyMock },
    }),
);

mock.module("@/lib/database/prisma", () => ({
    prisma: {
        gameChallenge: { findUnique: challengeFindUniqueMock },
        gameChallengeRound: { findUnique: challengeRoundFindUniqueMock, groupBy: scheduled },
        gameRound: { groupBy: played },
        mapsetTag: { findMany: async ({ where }: { where: { mapsetId: { in: number[] } } }) => selectedTags.filter(({ mapsetId }) => where.mapsetId.in.includes(mapsetId)) },
        mapsetData: { findUnique: async ({ where }: { where: { mapsetId: number } }) => mapset(where.mapsetId), findMany: metadata },
        skin: { findMany: skinPool, findUnique: findSkin },
        contentStat: { findMany: async () => [] },
        $transaction: transactionMock,
    },
}));
mock.module("@/lib/infra/redis", () => ({ default: { sMembers: mock(async () => []) } }));
mock.module("@/actions/media", () => ({ getMediaData: mock(async () => "media") }));
mock.module("@/lib/infra/env", () => ({ env: { DEBUG_DAILY_REUSE_CHECK: false, OSU_API_KEY: "" } }));
mock.module("@/lib/infra/redis-lock-core", () => ({ acquireRedisLock: mock(async () => ({ key: "lock", token: "token" })), releaseRedisLock: mock(async () => {}) }));
mock.module("@/lib/game/versioning", () => ({ CURRENT_PP_VERSION: 1, CURRENT_RULESET_VERSION: 1 }));

const { createManualDailyChallenge, getDailySkin } = await import("@/lib/game/mapsets");

describe("manual daily mapset choices", () => {
    beforeEach(() => {
        scheduled.mockReset().mockResolvedValue([]);
        played.mockReset().mockResolvedValue([]);
        metadata.mockReset().mockImplementation(async ({ where }) => where.mapsetId.in.map(mapset));
        skinPool.mockReset().mockResolvedValue([]);
        findSkin.mockReset().mockResolvedValue(null);
        challengeFindUniqueMock.mockReset().mockResolvedValue(null);
        challengeCreateMock.mockReset().mockImplementation(async (args) => args.data);
        challengeRoundCreateManyMock.mockReset().mockImplementation(async (args) => ({ count: args.data.length }));
        challengeRoundDeleteManyMock.mockReset().mockResolvedValue({ count: 5 });
        challengeDeleteMock.mockReset().mockResolvedValue({});
        transactionMock.mockReset().mockImplementation(async (operation) =>
            operation({
                gameChallenge: { create: challengeCreateMock, findUnique: challengeFindUniqueMock, delete: challengeDeleteMock },
                gameChallengeRound: { createMany: challengeRoundCreateManyMock, deleteMany: challengeRoundDeleteManyMock },
            }),
        );
    });

    test("saves the five selected mapsets in the requested round order", async () => {
        await createManualDailyChallenge(new Date("2026-11-18T00:00:00.000Z"), GameMode.Background, true, [5, 2, 4, 1, 3]);

        expect(challengeRoundCreateManyMock.mock.calls[0]?.[0].data.map((round) => round.itemId)).toEqual([5, 2, 4, 1, 3]);
        expect(challengeRoundCreateManyMock.mock.calls[0]?.[0].data.map((round) => round.answerSnapshot)).toEqual(["Song 5", "Song 2", "Song 4", "Song 1", "Song 3"]);
    });

    test("rejects a selected mapset that violates the repetition check", async () => {
        scheduled.mockResolvedValue([{ itemId: 3 }]);

        await expect(createManualDailyChallenge(new Date("2026-11-18T00:00:00.000Z"), GameMode.Background, false, [1, 2, 3, 4, 5])).rejects.toThrow("violates the daily repetition checks");
        expect(challengeRoundCreateManyMock).not.toHaveBeenCalled();
    });

    test("replaces an existing daily challenge and removes its old rounds atomically", async () => {
        challengeFindUniqueMock.mockResolvedValueOnce({ id: "old-challenge" });

        await createManualDailyChallenge(new Date("2026-11-18T00:00:00.000Z"), GameMode.Background, true, [1, 2, 3, 4, 5], true);

        expect(challengeRoundDeleteManyMock).toHaveBeenCalledWith({ where: { challengeId: "old-challenge" } });
        expect(challengeDeleteMock).toHaveBeenCalledWith({ where: { id: "old-challenge" } });
        expect(challengeCreateMock).toHaveBeenCalledTimes(1);
        expect(challengeRoundCreateManyMock).toHaveBeenCalledTimes(1);
    });
    test("persists automatic skin rounds so pool changes cannot change today's challenge", async () => {
        let challenge: { id: string } | null = null;
        let saved: Array<Record<string, unknown>> = [];
        const skin = (id: number): TestSkin => ({ id, name: `Skin ${id}`, imageFilename: `${id}.webp`, createdAt: new Date(), updatedAt: new Date() });
        let skins = Array.from({ length: 8 }, (_, i) => skin(i + 1));
        challengeFindUniqueMock.mockImplementation(async () => challenge);
        challengeCreateMock.mockImplementation(async ({ data }) => { challenge = { id: String(data.id) }; return data; });
        challengeRoundCreateManyMock.mockImplementation(async ({ data }) => { saved = data; return { count: data.length }; });
        challengeRoundFindUniqueMock.mockImplementation(async ({ where }) => saved.find(round => round.roundNumber === where.challengeId_roundNumber.roundNumber) ?? null);
        skinPool.mockImplementation(async () => skins);
        findSkin.mockImplementation(async ({ where }) => skins.find(({ id }) => id === where.id) ?? null);
        const first = await getDailySkin(3, 1);
        expect(saved).toHaveLength(5);
        skins = [...skins, skin(100)];
        expect((await getDailySkin(3, 1)).data.id).toBe(first.data.id);
    });

    test("rejects a different mapset containing a song already used that day", async () => {
        played.mockResolvedValue([{ itemId: 999 }]);
        metadata.mockImplementation(async ({ where }) => where.mapsetId.in.map((id) =>
            id === 999 ? { ...mapset(id), title: " SONG 3 (TV Size) " } : mapset(id),
        ));
        await expect(createManualDailyChallenge(new Date("2026-11-18Z"), GameMode.Audio, false, [1, 2, 3, 4, 5])).rejects.toThrow("repetition checks");
    });

});
