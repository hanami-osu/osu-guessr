"use server";

import { query } from "@/lib/database";
import { authenticatedAction } from "./server";
import { ReportType, Report } from "./types";
import redisClient from "@/lib/redis";

import { env } from "@/lib/env";
import { reportSchema } from "@/lib/report-validation";
import { createReportRecord } from "@/lib/report-service";

export type { ReportType };

const REPORT_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const REPORT_RATE_LIMIT_MAX_REQUESTS = 3;

async function enforceReportRateLimit(userId: number) {
    const key = `report_rate:${userId}`;
    const count = await redisClient.incr(key);
    if (count === 1) {
        await redisClient.expire(key, REPORT_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > REPORT_RATE_LIMIT_MAX_REQUESTS) {
        throw new Error("Too many reports. Please try again later.");
    }
}

export async function createReportAction(mapsetId: number, reportType: ReportType, description: string): Promise<void> {
    return authenticatedAction(async (session) => {
        const validated = reportSchema.parse({
            mapsetId,
            reportType,
            description,
        });
        await enforceReportRateLimit(session.user.banchoId);

        await createReportRecord(
            { ...validated, userId: session.user.banchoId },
            {
                query: (sql, values) => query(sql, values),
                webhookUrl: env.DISCORD_WEBHOOK,
                logError: (message) => console.error(message),
            }
        );
    });
}

export async function getUserReportsAction(): Promise<Report[]> {
    return authenticatedAction(async (session) => {
        return query(`SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC`, [session.user.banchoId]);
    });
}
