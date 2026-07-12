import { z } from "zod";
import { reportSchema } from "./report-validation";

const storedReportSchema = reportSchema.extend({
    userId: z.number().int().positive(),
});

type QueryFunction = (sql: string, values?: Array<unknown>) => Promise<unknown[]>;
type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ReportDependencies {
    query: QueryFunction;
    webhookUrl?: string;
    fetchImpl?: FetchFunction;
    logError?: (message: string) => void;
}

export class ReportMapsetNotFoundError extends Error {
    constructor() {
        super("Mapset not found");
        this.name = "ReportMapsetNotFoundError";
    }
}

function escapeDiscordMentions(value: string): string {
    return value.replace(/@/g, "@\u200b");
}

export async function createReportRecord(input: unknown, dependencies: ReportDependencies): Promise<void> {
    const report = storedReportSchema.parse(input);
    const [mapset] = (await dependencies.query(`SELECT title, artist FROM mapset_data WHERE mapset_id = ?`, [report.mapsetId])) as [{ title: string; artist: string }?];

    if (!mapset) {
        throw new ReportMapsetNotFoundError();
    }

    await dependencies.query(
        `INSERT INTO reports (
            user_id, mapset_id, report_type, description
        ) VALUES (?, ?, ?, ?)`,
        [report.userId, report.mapsetId, report.reportType, report.description]
    );

    if (!dependencies.webhookUrl) {
        return;
    }

    const reportMessage = `
**New Report**
Type: ${report.reportType}
Mapset: ${mapset.artist} - ${mapset.title}
Mapset ID: ${report.mapsetId}
Reported By: ${report.userId}

Description:
${escapeDiscordMentions(report.description)}

Mapset Link: https://osu.ppy.sh/s/${report.mapsetId}
`;

    try {
        const response = await (dependencies.fetchImpl ?? fetch)(dependencies.webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: reportMessage,
                allowed_mentions: { parse: [] },
            }),
        });

        if (!response.ok) {
            dependencies.logError?.(`Report webhook delivery failed with status ${response.status}`);
        }
    } catch {
        dependencies.logError?.("Report webhook delivery failed");
    }
}
