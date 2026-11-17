import { beforeEach, describe, expect, mock, test } from "bun:test";
import { GameMode } from "@/actions/types";

type TestMapsetTag = { mapset_id: number; image_filename: string; audio_filename: string };
const selectedTags: TestMapsetTag[] = [1, 2, 3, 4, 5].map((mapset_id) => ({
    mapset_id,
    image_filename: `${mapset_id}.webp`,
    audio_filename: `${mapset_id}.mp3`,
}));
const queryMock = mock<(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>>(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT DISTINCT used.item_id")) return [];
    if (sql.includes("FROM mapset_tags")) return selectedTags.filter(({ mapset_id }) => params.includes(mapset_id));
    if (sql.includes("FROM mapset_data")) {
        const mapsetId = Number(params[0]);
        return [{ mapset_id: mapsetId, title: `Song ${mapsetId}`, artist: "Artist", mapper: "Mapper" }];
    }
    return [];
});
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

mock.module("@/lib/database", () => ({ query: queryMock }));
mock.module("@/lib/database/prisma", () => ({
    prisma: {
        gameChallenge: { findUnique: challengeFindUniqueMock },
        gameChallengeRound: { findUnique: challengeRoundFindUniqueMock },
        contentStat: { findMany: async () => [] },
        $transaction: transactionMock,
    },
}));
mock.module("@/lib/infra/redis", () => ({ default: { sMembers: mock(async () => []) } }));
mock.module("@/actions/media", () => ({ getMediaData: mock(async () => "media") }));
mock.module("@/lib/infra/env", () => ({ env: { DEBUG_DAILY_REUSE_CHECK: false, OSU_API_KEY: "" } }));
mock.module("@/lib/infra/redis-lock-core", () => ({ acquireRedisLock: mock(async () => ({ key: "lock", token: "token" })), releaseRedisLock: mock(async () => {}) }));
mock.module("@/lib/game/versioning", () => ({ CURRENT_PP_VERSION: 1, CURRENT_RULESET_VERSION: 1 }));

const { createManualDailyChallenge, getDailySkin } = await import("./mapsets");

describe("manual daily mapset choices", () => {
    beforeEach(() => {
        queryMock.mockReset().mockImplementation(async (sql, params = []) => {
            if (sql.includes("SELECT DISTINCT used.item_id")) return [];
            if (sql.includes("FROM mapset_tags")) return selectedTags.filter(({ mapset_id }) => params.includes(mapset_id));
            if (sql.includes("FROM mapset_data")) {
                const mapsetId = Number(params[0]);
                return [{ mapset_id: mapsetId, title: `Song ${mapsetId}`, artist: "Artist", mapper: "Mapper" }];
            }
            return [];
        });
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
        queryMock.mockImplementation(async (sql, params = []) => {
            if (sql.includes("SELECT DISTINCT used.item_id")) return [{ item_id: 3 }];
            if (sql.includes("FROM mapset_tags")) return selectedTags.filter(({ mapset_id }) => params.includes(mapset_id));
            return [];
        });

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
        let skins = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `Skin ${i + 1}`, image_filename: `${i + 1}.webp` }));
        challengeFindUniqueMock.mockImplementation(async () => challenge);
        challengeCreateMock.mockImplementation(async ({ data }) => { challenge = { id: String(data.id) }; return data; });
        challengeRoundCreateManyMock.mockImplementation(async ({ data }) => { saved = data; return { count: data.length }; });
        challengeRoundFindUniqueMock.mockImplementation(async ({ where }) => saved.find(round => round.roundNumber === where.challengeId_roundNumber.roundNumber) ?? null);
        queryMock.mockImplementation(async (sql, params = []) => sql.includes("FROM skins") ? (sql.includes("WHERE id =") ? skins.filter(skin => skin.id === params[0]) : skins) : []);
        const first = await getDailySkin(3, 1);
        expect(saved).toHaveLength(5);
        skins = [...skins, { id: 100, name: "New skin", image_filename: "100.webp" }];
        expect((await getDailySkin(3, 1)).data.id).toBe(first.data.id);
    });

    test("rejects a different mapset containing a song already used that day", async () => {
        queryMock.mockImplementation(async (sql, params = []) => {
            if (sql.includes("SELECT DISTINCT used.item_id")) return [{ item_id: 999, title: " SONG 3 (TV Size) " }];
            if (sql.includes("FROM mapset_tags")) return selectedTags.filter(tag => params.includes(tag.mapset_id));
            if (sql.includes("FROM mapset_data")) return selectedTags.map(tag => ({ mapset_id: tag.mapset_id, title: `Song ${tag.mapset_id}`, artist: "Artist", mapper: "Mapper" }));
            return [];
        });
        await expect(createManualDailyChallenge(new Date("2026-11-18Z"), GameMode.Audio, false, [1, 2, 3, 4, 5])).rejects.toThrow("repetition checks");
    });

});
