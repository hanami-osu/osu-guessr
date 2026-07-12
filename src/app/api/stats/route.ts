import { NextResponse } from "next/server";
import { validateApiKey } from "@/actions/api-keys-server";
import { getHighestStatsAction } from "@/actions/user-server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/errors";

const querySchema = z.object({
    variant: z.enum(["classic", "death"]).default("classic"),
});

export async function GET(request: Request) {
    const headers = new Headers(request.headers);
    const apiKey = headers.get("X-API-Key");

    try {
        await validateApiKey(apiKey);
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            variant: searchParams.get("variant") ?? undefined,
        });

        const stats = await getHighestStatsAction(query.variant);

        return NextResponse.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        return apiErrorResponse(error, "Failed to fetch stats", "Stats error");
    }
}
