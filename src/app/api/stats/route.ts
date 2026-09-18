import { NextResponse } from "next/server";
import { getHighestStatsAction } from "@/actions/user-server";
import { z } from "zod";
import { withApiKey } from "@/app/api/_lib/handler";
import { apiVariantSchema } from "@/app/api/_lib/schemas";

const querySchema = z.object({
    variant: apiVariantSchema.default("classic"),
});

export async function GET(request: Request) {
    return withApiKey(request, async () => {
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            variant: searchParams.get("variant") ?? undefined,
        });

        const stats = await getHighestStatsAction(query.variant);

        return NextResponse.json({
            success: true,
            data: stats,
        });
    }, { fallbackMessage: "Failed to fetch stats", logLabel: "Stats error" });
}
