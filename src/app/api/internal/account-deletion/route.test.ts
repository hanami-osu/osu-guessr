import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const secret = "s".repeat(32);
const env: { HANAMI_INTERNAL_SECRET?: string } = { HANAMI_INTERNAL_SECRET: secret };
const runMock = mock(async (action: string, userId: number) => {
    void action;
    void userId;
});

mock.module("@/lib/infra/env", () => ({ env }));
mock.module("@/lib/database/prisma", () => ({ prisma: {} }));
mock.module("@/lib/infra/redis", () => ({ default: { del: mock(async () => 1) } }));
mock.module("@/lib/multiplayer/multiplayer", () => ({ removeMultiplayerUser: mock(async () => {}) }));
mock.module("@/lib/users/account-deletion", () => ({ createAccountDeletionService: () => ({ run: runMock }) }));

const { POST } = await import("./route");

function request(body: unknown, authorization: string | null = `Bearer ${secret}`) {
    return new Request("http://localhost/api/internal/account-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

beforeEach(() => {
    env.HANAMI_INTERNAL_SECRET = secret;
    runMock.mockReset();
});

describe("POST /api/internal/account-deletion", () => {
    test.each(["hide", "restore", "purge"])("runs %s for a valid request", async (action) => {
        const response = await POST(request({ banchoId: 123, action }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(runMock).toHaveBeenCalledWith(action, 123);
    });

    test.each([
        ["a missing header", null],
        ["a wrong secret", `Bearer ${"x".repeat(32)}`],
        ["a secret prefix", `Bearer ${secret.slice(0, 16)}`],
        ["a non-bearer scheme", `Basic ${secret}`],
    ])("rejects %s with 401", async (_reason, authorization) => {
        const response = await POST(request({ banchoId: 123, action: "purge" }, authorization));

        expect(response.status).toBe(401);
        expect(runMock).not.toHaveBeenCalled();
    });

    test("checks the secret before reading the body", async () => {
        const response = await POST(request("not json", null));

        expect(response.status).toBe(401);
    });

    test.each([
        ["invalid JSON", "{"],
        ["a missing action", { banchoId: 123 }],
        ["an unknown action", { banchoId: 123, action: "delete" }],
        ["a non-positive id", { banchoId: 0, action: "hide" }],
        ["a fractional id", { banchoId: 1.5, action: "hide" }],
        ["a missing id", { action: "hide" }],
    ])("rejects %s with 400", async (_reason, body) => {
        const response = await POST(request(body));

        expect(response.status).toBe(400);
        expect(runMock).not.toHaveBeenCalled();
    });

    test("refuses every request when no secret is configured", async () => {
        env.HANAMI_INTERNAL_SECRET = undefined;

        const response = await POST(request({ banchoId: 123, action: "purge" }, "Bearer undefined"));

        expect(response.status).toBe(503);
        expect(runMock).not.toHaveBeenCalled();
    });

    test("returns 500 when the action fails", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(() => {});
        runMock.mockImplementation(async () => {
            throw new Error("database unavailable");
        });

        const response = await POST(request({ banchoId: 123, action: "purge" }));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ ok: false, error: "Account deletion failed" });
        consoleError.mockRestore();
    });
});
