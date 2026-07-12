import { z } from "zod";

export const reportTypeSchema = z.enum(["incorrect_title", "inappropriate_content", "wrong_audio", "wrong_background", "other"]);
export const reportStatusSchema = z.enum(["pending", "investigating", "resolved", "rejected"]);

export const reportSchema = z.object({
    mapsetId: z.number().int().positive(),
    reportType: reportTypeSchema,
    description: z.string().trim().min(10).max(1000),
});

export const reportStatusUpdateSchema = z.object({
    reportId: z.number().int().positive(),
    status: reportStatusSchema,
});
