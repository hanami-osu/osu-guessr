import { beforeEach, describe, expect, mock, test } from "bun:test";

const secret = "s".repeat(32);
const env: { HANAMI_INTERNAL_SECRET?: string } = { HANAMI_INTERNAL_SECRET: secret };
const applyMock = mock(async (database: unknown, banchoId: number, state: unknown) => {
    void database;
    void banchoId;
    void state;
});

mock.module("@/lib/env", () => ({ env }));
mock.module("@/lib/database/prisma", () => ({ prisma: {} }));
mock.module("@/lib/supporter", () => ({ applySupporterBadge: applyMock }));

const { POST } = await import("./route");

function request(body: unknown, authorization: string | null = `Bearer ${secret}`) {
    return new Request("http://localhost/api/internal/supporter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    env.HANAMI_INTERNAL_SECRET = secret;
    applyMock.mockReset();
});

describe("POST /api/internal/supporter", () => {
    test("stores the pushed state", async () => {
        const response = await POST(request({ banchoId: 123, badge: true }));

        expect(response.status).toBe(200);
        expect(applyMock).toHaveBeenCalledWith({}, 123, true);
    });

    test("rejects a wrong secret", async () => {
        const response = await POST(request({ banchoId: 123, badge: true }, "Bearer nope"));
        expect(response.status).toBe(401);
        expect(applyMock).not.toHaveBeenCalled();
    });

    test("rejects a malformed body", async () => {
        const response = await POST(request({ banchoId: 123, badge: "yes" }));
        expect(response.status).toBe(400);
    });

    test("is unavailable without a secret", async () => {
        env.HANAMI_INTERNAL_SECRET = undefined;
        const response = await POST(request({ banchoId: 123, badge: true }));
        expect(response.status).toBe(503);
    });
});
