"use server";

import { prisma } from "@/lib/database/prisma";
import { Report } from "@/actions/types";
import { requireAdmin } from "@/actions/require-admin";
import { reportStatusUpdateSchema } from "@/lib/reports/report-validation";

export async function listReports(): Promise<Report[]> {
    try {
        await requireAdmin();
        const rows = await prisma.report.findMany({ orderBy: { createdAt: "desc" } });
        const results = rows.map((report) => ({
            id: report.id,
            user_id: report.userId,
            mapset_id: report.mapsetId,
            report_type: report.reportType,
            description: report.description,
            status: report.status,
            created_at: report.createdAt,
            updated_at: report.updatedAt,
        }));
        console.table(results);
        return results;
    } catch (error) {
        console.error("Error listing reports:", error);
        return [];
    }
}

export async function updateReportStatus(reportId: number, status: string): Promise<void> {
    try {
        await requireAdmin();
        const validated = reportStatusUpdateSchema.parse({ reportId, status });
        await prisma.report.updateMany({ where: { id: validated.reportId }, data: { status: validated.status } });
        console.log(`Report ${validated.reportId} status updated to ${validated.status}`);
    } catch (error) {
        console.error(`Error updating report ${reportId}:`, error);
        throw error;
    }
}
