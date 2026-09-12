import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api/validate-key";
import { getUserStatsAction } from "@/actions/user-server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/errors";

const querySchema = z.object({
    mode: z.enum(["background", "audio", "skin"]).optional(),
    variant: z.enum(["classic", "survival", "death"]).optional(),
});
const userIdSchema = z.coerce.number().int().positive();

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    const headers = new Headers(request.headers);
    const apiKey = headers.get("X-API-Key");

    try {
        await validateApiKey(apiKey);
        const { userId } = await params;
        const banchoId = userIdSchema.parse(userId);
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            mode: searchParams.get("mode") ?? undefined,
            variant: searchParams.get("variant") ?? undefined,
        });

        const stats = query.variant ? await getUserStatsAction(banchoId, query.variant) : await getUserStatsAction(banchoId);
        const filteredStats = query.mode ? stats.filter((s) => s.game_mode === query.mode) : stats;

        return NextResponse.json({
            success: true,
            data: filteredStats,
        });
    } catch (error) {
        return apiErrorResponse(error, "Failed to fetch user stats", "Stats error");
    }
}
