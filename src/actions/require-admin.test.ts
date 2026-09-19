import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "next-auth";

const getAuthSessionMock = mock(async (): Promise<Session> => ({
    expires: "2099-01-01T00:00:00.000Z",
    user: { banchoId: 123, isAdmin: true, name: "admin", image: null },
}));

mock.module("server-only", () => ({}));
mock.module("@/actions/server", () => ({ getAuthSession: getAuthSessionMock }));

let requireAdmin: typeof import("./require-admin").requireAdmin;

beforeAll(async () => {
    ({ requireAdmin } = await import("./require-admin"));
});

beforeEach(() => {
    getAuthSessionMock.mockImplementation(async () => ({
        expires: "2099-01-01T00:00:00.000Z",
        user: { banchoId: 123, isAdmin: true, name: "admin", image: null },
    }));
});

describe("requireAdmin", () => {
    test("allows admins", async () => {
        await expect(requireAdmin()).resolves.toMatchObject({ user: { banchoId: 123, isAdmin: true } });
    });

    test("rejects non-admin users", async () => {
        getAuthSessionMock.mockImplementation(async () => ({
            expires: "2099-01-01T00:00:00.000Z",
            user: { banchoId: 456, isAdmin: false, name: "player", image: null },
        }));

        await expect(requireAdmin()).rejects.toThrow("Forbidden");
    });
});
