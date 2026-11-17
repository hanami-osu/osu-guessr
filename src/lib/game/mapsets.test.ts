import { beforeEach, describe, expect, mock, test } from "bun:test";
import { GameMode } from "@/actions/types";

type TestMapsetTag = { mapset_id: number; image_filename: string; audio_filename: string };
const selectedTags: TestMapsetTag[] = [1, 2, 3, 4, 5].map((mapset_id) => ({
    mapset_id,
    image_filename: `${mapset_id}.webp`,
    audio_filename: `${mapset_id}.mp3`,
}));
const queryMock = mock(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT DISTINCT used.item_id")) return [];
    if (sql.includes("FROM mapset_tags")) return selectedTags.filter(({ mapset_id }) => params.includes(mapset_id));
    if (sql.includes("FROM mapset_data")) {
        const mapsetId = Number(params[0]);
        return [{ mapset_id: mapsetId, title: `Song ${mapsetId}`, artist: "Artist", mapper: "Mapper" }];
    }
    return [];
});
const challengeFindUniqueMock = mock(async () => null);
const challengeCreateMock = mock(async (args: { data: Record<string, unknown> }) => args.data);
const challengeRoundCreateManyMock = mock(async (args: { data: Array<Record<string, unknown>> }) => ({ count: args.data.length }));
const challengeRoundDeleteManyMock = mock(async () => ({ count: 5 }));
const challengeDeleteMock = mock(async () => ({}));
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
        $transaction: transactionMock,
    },
}));
mock.module("@/lib/redis", () => ({ default: { sMembers: mock(async () => []) } }));
mock.module("@/actions/media", () => ({ getMediaData: mock(async () => "media") }));
mock.module("@/lib/env", () => ({ env: { DEBUG_DAILY_REUSE_CHECK: false, OSU_API_KEY: "" } }));
mock.module("@/lib/redis-lock-core", () => ({ acquireRedisLock: mock(async () => ({ key: "lock", token: "token" })), releaseRedisLock: mock(async () => {}) }));
mock.module("@/lib/game/versioning", () => ({ CURRENT_PP_VERSION: 1, CURRENT_RULESET_VERSION: 1 }));

const { createManualDailyChallenge } = await import("./mapsets");

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
});
