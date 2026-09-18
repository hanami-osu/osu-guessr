import { NextResponse } from "next/server";
import { getTopPlayersAction } from "@/actions/user-server";
import { GameMode } from "@/actions/types";
import { z } from "zod";
import { normalizeDatabaseValue } from "@/lib/database/normalize";
import { withApiKey } from "@/app/api/_lib/handler";
import { apiGameModeSchema, apiVariantSchema } from "@/app/api/_lib/schemas";

const querySchema = z.object({
    mode: apiGameModeSchema.default(GameMode.Background),
    variant: apiVariantSchema.default("classic"),
    limit: z.coerce.number().int().min(1).max(100).default(100),
});

export async function GET(request: Request) {
    return withApiKey(request, async () => {
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            mode: searchParams.get("mode") ?? undefined,
            variant: searchParams.get("variant") ?? undefined,
            limit: searchParams.get("limit") ?? undefined,
        });

        const leaderboard = await getTopPlayersAction(query.mode, query.variant, query.limit);

        return NextResponse.json({
            success: true,
            data: normalizeDatabaseValue(leaderboard),
        });
    }, { fallbackMessage: "Failed to fetch leaderboard", logLabel: "Leaderboard error" });
}
