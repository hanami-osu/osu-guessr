import { beforeEach, describe, expect, mock, test } from "bun:test";
import { OWNER_ID } from "../lib";

const queryMock = mock(async (sql: string, values?: unknown[]) => {
    void sql;
    void values;
    return [] as Array<{ is_admin: number | boolean; deletion_scheduled_at: Date | null }>;
});

mock.module("server-only", () => ({}));
mock.module("@/lib/database", () => ({ query: queryMock }));

const { getSessionUserAccess, clearSessionUserAccessCache } = await import("./admin");

beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockImplementation(async () => []);
    clearSessionUserAccessCache();
});

describe("getSessionUserAccess", () => {
    test("is inactive without a user id", async () => {
        expect(await getSessionUserAccess(undefined)).toEqual({ active: false, isAdmin: false });
        expect(queryMock).not.toHaveBeenCalled();
    });

    test("is inactive when the user row is gone", async () => {
        expect(await getSessionUserAccess(OWNER_ID)).toEqual({ active: false, isAdmin: false });
    });

    test("is inactive while a deletion is scheduled, even for admins", async () => {
        queryMock.mockImplementation(async () => [{ is_admin: 1, deletion_scheduled_at: new Date() }]);

        expect(await getSessionUserAccess(123)).toEqual({ active: false, isAdmin: false });
    });

    test("reports admin status for active users", async () => {
        queryMock.mockImplementation(async () => [{ is_admin: 0, deletion_scheduled_at: null }]);
        expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: false });
        expect(await getSessionUserAccess(OWNER_ID)).toEqual({ active: true, isAdmin: true });

        queryMock.mockImplementation(async () => [{ is_admin: 1, deletion_scheduled_at: null }]);
    clearSessionUserAccessCache();
        expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: true });
    });

    test("serves repeated lookups from the cache while it is fresh", async () => {
        queryMock.mockImplementation(async () => [{ is_admin: 0, deletion_scheduled_at: null }]);

        expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: false });
        expect(await getSessionUserAccess(123)).toEqual({ active: true, isAdmin: false });
        expect(queryMock).toHaveBeenCalledTimes(1);
    });
});
