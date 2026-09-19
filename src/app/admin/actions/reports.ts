"use server";

import { query } from "@/lib/database";
import { Report } from "@/actions/types";
import { requireAdmin } from "@/actions/require-admin";
import { reportStatusUpdateSchema } from "@/lib/report-validation";

export async function listReports(): Promise<Report[]> {
    try {
        await requireAdmin();
        const results = await query(`
            SELECT
                id,
                user_id,
                mapset_id,
                report_type,
                description,
                status,
                created_at,
                updated_at
            FROM reports
            ORDER BY created_at DESC
        `);
        console.table(results);
        return results as Report[];
    } catch (error) {
        console.error("Error listing reports:", error);
        return [];
    }
}

export async function updateReportStatus(reportId: number, status: string): Promise<void> {
    try {
        await requireAdmin();
        const validated = reportStatusUpdateSchema.parse({ reportId, status });
        await query(`UPDATE reports SET status = ? WHERE id = ?`, [validated.status, validated.reportId]);
        console.log(`Report ${validated.reportId} status updated to ${validated.status}`);
    } catch (error) {
        console.error(`Error updating report ${reportId}:`, error);
        throw error;
    }
}
