import { describe, expect, test } from "bun:test";
import { getApplicationHealth } from "./health";

describe("getApplicationHealth", () => {
    test("returns 200 with dependency status and deployment ID when healthy", async () => {
        const result = await getApplicationHealth(
            {
                redisPing: async () => "PONG",
                mariaDbPing: async () => [{ ok: 1 }],
            },
            "deployment-123"
        );

        expect(result).toEqual({
            status: 200,
            body: {
                ok: true,
                deploymentId: "deployment-123",
                dependencies: { redis: "ok", mariadb: "ok" },
            },
        });
    });

    test("checks both dependencies and returns 503 when Redis fails", async () => {
        let mariaDbChecked = false;
        const result = await getApplicationHealth(
            {
                redisPing: async () => {
                    throw new Error("redis://user:secret@internal:6379 failed");
                },
                mariaDbPing: async () => {
                    mariaDbChecked = true;
                },
            },
            undefined
        );

        expect(mariaDbChecked).toBe(true);
        expect(result.status).toBe(503);
        expect(result.body).toEqual({
            ok: false,
            deploymentId: null,
            dependencies: { redis: "unavailable", mariadb: "ok" },
        });
        expect(JSON.stringify(result)).not.toContain("secret");
    });

    test("returns 503 when MariaDB fails or a dependency times out", async () => {
        const databaseFailure = await getApplicationHealth(
            {
                redisPing: async () => "PONG",
                mariaDbPing: async () => {
                    throw new Error("database unavailable");
                },
            },
            "deployment"
        );
        const timeout = await getApplicationHealth(
            {
                redisPing: () => new Promise(() => {}),
                mariaDbPing: async () => undefined,
            },
            "deployment",
            5
        );

        expect(databaseFailure.status).toBe(503);
        expect(databaseFailure.body.dependencies.mariadb).toBe("unavailable");
        expect(timeout.status).toBe(503);
        expect(timeout.body.dependencies.redis).toBe("unavailable");
    });
});
