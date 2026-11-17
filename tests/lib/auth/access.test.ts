import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { OWNER_ID } from "@/lib/users/owner";

const findUser = mock(async () => null as { isAdmin: boolean; deletionScheduledAt: Date | null } | null);

mock.module("server-only", () => ({}));
mock.module("@/lib/database/prisma", () => ({ prisma: { user: { findUnique: findUser } } }));

const { getSessionUserAccess, clearSessionUserAccessCache } = await import("@/lib/auth/access");

beforeEach(() => {
    findUser.mockReset();
    findUser.mockResolvedValue(null);
    clearSessionUserAccessCache();
});

describe("getSessionUserAccess", () => {
    test("is inactive without a user id", async () => {
        expect(await getSessionUserAccess(undefined)).toEqual({ active: false, isAdmin: false });
        expect(findUser).not.toHaveBeenCalled();
    });

    test("is inactive when the user row is gone", async () => {
        expect(await getSessionUserAccess(OWNER_ID)).toEqual({ active: false, isAdmin: false });
    });

    test("is inactive while a deletion is scheduled, even for admins", async () => {
        findUser.mockResolvedValue({ isAdmin: true, deletionScheduledAt: new Date() });

        expect(await getSessionUserAccess(123)).toEqual({ active: false, isAdmin: false });
    });

    test("reports admin status for active users", async () => {
        findUser.mockResolvedValue({ isAdmin: false, deletionScheduledAt: null });
        expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: false });
        expect(await getSessionUserAccess(OWNER_ID)).toEqual({ active: true, isAdmin: true });

        findUser.mockResolvedValue({ isAdmin: true, deletionScheduledAt: null });
        clearSessionUserAccessCache();
        expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: true });
    });

    test("a cached admin loses access when the cache expires after account deletion is scheduled", async () => {
        try {
            const signedInAt = new Date("2026-11-18T12:00:00Z");
            setSystemTime(signedInAt);
            findUser.mockResolvedValue({ isAdmin: true, deletionScheduledAt: null });
            expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: true });

            findUser.mockResolvedValue({ isAdmin: true, deletionScheduledAt: signedInAt });
            setSystemTime(new Date(signedInAt.getTime() + 29_999));
            expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: true });

            setSystemTime(new Date(signedInAt.getTime() + 30_000));
            expect(await getSessionUserAccess(123)).toEqual({ active: false, isAdmin: false });
        } finally {
            setSystemTime();
        }
    });
});
