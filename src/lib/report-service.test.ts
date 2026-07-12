import { describe, expect, mock, test } from "bun:test";
import { ZodError } from "zod";
import { createReportRecord, ReportMapsetNotFoundError } from "./report-service";
import { reportStatusUpdateSchema } from "./report-validation";

const validReport = {
    userId: 123,
    mapsetId: 456,
    reportType: "wrong_audio",
    description: "The audio belongs to another mapset.",
} as const;

describe("createReportRecord", () => {
    test("stores a report without attempting delivery when no webhook is configured", async () => {
        const queries: string[] = [];
        const fetchImpl = mock(async () => new Response(null, { status: 204 }));

        await createReportRecord(validReport, {
            query: async (sql) => {
                queries.push(sql);
                return sql.startsWith("SELECT") ? [{ title: "Title", artist: "Artist" }] : [];
            },
            fetchImpl,
        });

        expect(queries.some((sql) => sql.includes("INSERT INTO reports"))).toBe(true);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("keeps the stored report when Discord returns an error", async () => {
        let stored = false;
        const loggedErrors: string[] = [];
        const webhookUrl = "https://discord.example/private-webhook";

        await createReportRecord(validReport, {
            query: async (sql) => {
                if (sql.startsWith("SELECT")) return [{ title: "Title", artist: "Artist" }];
                stored = true;
                return [];
            },
            webhookUrl,
            fetchImpl: async () => {
                expect(stored).toBe(true);
                return new Response(null, { status: 503 });
            },
            logError: (message) => loggedErrors.push(message),
        });

        expect(stored).toBe(true);
        expect(loggedErrors).toEqual(["Report webhook delivery failed with status 503"]);
        expect(loggedErrors.join(" ")).not.toContain(webhookUrl);
    });

    test("bounds webhook delivery and aborts it without failing the stored report", async () => {
        let stored = false;
        let deliverySignal: AbortSignal | null | undefined;
        const loggedErrors: string[] = [];

        await createReportRecord(validReport, {
            query: async (sql) => {
                if (sql.startsWith("SELECT")) return [{ title: "Title", artist: "Artist" }];
                stored = true;
                return [];
            },
            webhookUrl: "https://discord.example/private-webhook",
            webhookTimeoutMs: 5,
            fetchImpl: async (_input, init) => {
                expect(stored).toBe(true);
                deliverySignal = init?.signal;
                return new Promise<Response>(() => {});
            },
            logError: (message) => loggedErrors.push(message),
        });

        expect(stored).toBe(true);
        expect(deliverySignal?.aborted).toBe(true);
        expect(loggedErrors).toEqual(["Report webhook delivery timed out"]);
    });

    test("returns a controlled error when the mapset does not exist", async () => {
        let inserted = false;

        await expect(
            createReportRecord(validReport, {
                query: async (sql) => {
                    if (sql.includes("INSERT INTO reports")) inserted = true;
                    return [];
                },
            })
        ).rejects.toBeInstanceOf(ReportMapsetNotFoundError);

        expect(inserted).toBe(false);
    });

    test("rejects an invalid report type before querying", async () => {
        const query = mock(async () => []);

        await expect(
            createReportRecord(
                { ...validReport, reportType: "not-a-report-type" },
                { query }
            )
        ).rejects.toBeInstanceOf(ZodError);

        expect(query).not.toHaveBeenCalled();
    });
});

describe("reportStatusUpdateSchema", () => {
    test("rejects invalid report IDs and statuses", () => {
        expect(reportStatusUpdateSchema.safeParse({ reportId: 0, status: "pending" }).success).toBe(false);
        expect(reportStatusUpdateSchema.safeParse({ reportId: 1, status: "deleted" }).success).toBe(false);
        expect(reportStatusUpdateSchema.safeParse({ reportId: 1, status: "resolved" }).success).toBe(true);
    });
});
