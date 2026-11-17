import { describe, expect, mock, test } from "bun:test";
import { ZodError } from "zod";
import { createReportRecord, ReportMapsetNotFoundError } from "@/lib/reports/report-service";
import { reportStatusUpdateSchema } from "@/lib/reports/report-validation";

const validReport = {
    userId: 123,
    mapsetId: 456,
    reportType: "wrong_audio",
    description: "The audio belongs to another mapset.",
} as const;

const findMapset = async () => ({ title: "Title", artist: "Artist" });

describe("createReportRecord", () => {
    test("stores a report without attempting delivery when no webhook is configured", async () => {
        const saveReport = mock(async () => {});
        const fetchImpl = mock(async () => new Response(null, { status: 204 }));

        await createReportRecord(validReport, {
            findMapset,
            saveReport,
            fetchImpl,
        });

        expect(saveReport).toHaveBeenCalledWith(validReport);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("keeps the stored report when Discord returns an error", async () => {
        let stored = false;
        const loggedErrors: string[] = [];
        const webhookUrl = "https://discord.example/private-webhook";

        await createReportRecord(validReport, {
            findMapset,
            saveReport: async () => { stored = true; },
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
            findMapset,
            saveReport: async () => { stored = true; },
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
        const saveReport = mock(async () => {});

        await expect(
            createReportRecord(validReport, {
                findMapset: async () => null,
                saveReport,
            }),
        ).rejects.toBeInstanceOf(ReportMapsetNotFoundError);

        expect(saveReport).not.toHaveBeenCalled();
    });

    test("rejects an invalid report type before looking up a mapset", async () => {
        const findMapset = mock(async () => null);

        await expect(createReportRecord({ ...validReport, reportType: "not-a-report-type" }, { findMapset, saveReport: async () => {} })).rejects.toBeInstanceOf(ZodError);

        expect(findMapset).not.toHaveBeenCalled();
    });
});

describe("reportStatusUpdateSchema", () => {
    test("rejects invalid report IDs and statuses", () => {
        expect(reportStatusUpdateSchema.safeParse({ reportId: 0, status: "pending" }).success).toBe(false);
        expect(reportStatusUpdateSchema.safeParse({ reportId: 1, status: "deleted" }).success).toBe(false);
        expect(reportStatusUpdateSchema.safeParse({ reportId: 1, status: "resolved" }).success).toBe(true);
    });
});
