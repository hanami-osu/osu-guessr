import { NextResponse } from "next/server";
import { getUserStatsAction } from "@/actions/user-server";
import { z } from "zod";
import { normalizeDatabaseValue } from "@/lib/database/normalize";
import { withApiKey } from "@/app/api/_lib/handler";
import { apiUserIdSchema, apiVariantSchema } from "@/app/api/_lib/schemas";

const querySchema = z.object({
    mode: z.enum(["background", "audio", "skin"]).optional(),
    variant: apiVariantSchema.optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    return withApiKey(request, async () => {
        const { userId } = await params;
        const banchoId = apiUserIdSchema.parse(userId);
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            mode: searchParams.get("mode") ?? undefined,
            variant: searchParams.get("variant") ?? undefined,
        });

        const stats = query.variant ? await getUserStatsAction(banchoId, query.variant) : await getUserStatsAction(banchoId);
        const filteredStats = query.mode ? stats.filter((s) => s.game_mode === query.mode) : stats;

        return NextResponse.json({
            success: true,
            data: normalizeDatabaseValue(filteredStats),
        });
    }, { fallbackMessage: "Failed to fetch user stats", logLabel: "Stats error" });
}
