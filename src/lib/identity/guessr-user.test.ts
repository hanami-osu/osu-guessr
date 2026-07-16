import { describe, expect, test } from "bun:test";
import type { User } from "@/generated/prisma/client";
import type { HanamiIdentityClaims } from "./claims";
import { claimGuessrUserWithRepository, GuessrIdentityConflictError, type GuessrIdentityRepository } from "./claim-core";

const claims: HanamiIdentityClaims = {
    hanamiUserId: "hanami-user-123",
    banchoId: 17279598,
    name: "player",
    image: "https://a.ppy.sh/17279598",
};

function user(overrides: Partial<User> = {}): User {
    return {
        banchoId: 17279598,
        hanamiUserId: null,
        username: "legacy-player",
        avatarUrl: "https://a.ppy.sh/17279598",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    };
}

function repository(initialRows: User[], concurrentOwner?: string): GuessrIdentityRepository {
    const rows = new Map(initialRows.map((row) => [row.banchoId, { ...row }]));
    return {
        findByHanamiUserId: async (hanamiUserId) => [...rows.values()].find((row) => row.hanamiUserId === hanamiUserId) ?? null,
        findByBanchoId: async (banchoId) => rows.get(banchoId) ?? null,
        create: async (identity) => {
            const created = user({
                banchoId: identity.banchoId,
                hanamiUserId: identity.hanamiUserId,
                username: identity.name ?? "fallback",
                avatarUrl: identity.image ?? "/default-avatar.svg",
            });
            rows.set(created.banchoId, created);
            return created;
        },
        claimUnclaimed: async (identity) => {
            const row = rows.get(identity.banchoId);
            if (!row || row.hanamiUserId) return 0;
            row.hanamiUserId = concurrentOwner ?? identity.hanamiUserId;
            return concurrentOwner ? 0 : 1;
        },
        updateProfile: async (banchoId, identity) => {
            const row = rows.get(banchoId);
            if (!row) throw new Error("missing test row");
            if (identity.name) row.username = identity.name;
            if (identity.image) row.avatarUrl = identity.image;
            return row;
        },
    };
}

describe("claimGuessrUserWithRepository", () => {
    test("atomically claims an existing unclaimed osu! user", async () => {
        const result = await claimGuessrUserWithRepository(claims, repository([user()]));
        expect(result.outcome).toBe("claimed");
        expect(result.user.hanamiUserId).toBe(claims.hanamiUserId);
        expect(result.user.banchoId).toBe(claims.banchoId);
    });

    test("allows a repeated login by the same Hanami account", async () => {
        const result = await claimGuessrUserWithRepository(claims, repository([user({ hanamiUserId: claims.hanamiUserId })]));
        expect(result.outcome).toBe("existing");
    });

    test("creates a new Guessr user from trusted claims", async () => {
        const result = await claimGuessrUserWithRepository(claims, repository([]));
        expect(result.outcome).toBe("created");
        expect(result.user).toMatchObject({
            banchoId: claims.banchoId,
            hanamiUserId: claims.hanamiUserId,
            username: claims.name,
        });
    });

    test("blocks transfer of an osu! profile to another Hanami account", async () => {
        await expect(claimGuessrUserWithRepository(claims, repository([user({ hanamiUserId: "another-hanami-user" })]))).rejects.toBeInstanceOf(GuessrIdentityConflictError);
    });

    test("detects a conflicting concurrent claim", async () => {
        await expect(claimGuessrUserWithRepository(claims, repository([user()], "another-hanami-user"))).rejects.toMatchObject({
            code: "concurrent_claim_conflict",
        });
    });
});
