import { NextResponse } from "next/server";
import { getUserGamesCountAction, getUserLatestGamesAction } from "@/actions/user-server";
import { z } from "zod";
import { withApiKey } from "@/app/api/_lib/handler";
import { apiGameModeSchema, apiUserIdSchema, apiVariantSchema } from "@/app/api/_lib/schemas";

const querySchema = z.object({
    mode: apiGameModeSchema.optional(),
    variant: apiVariantSchema.default("classic"),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    return withApiKey(request, async () => {
        const { userId } = await params;
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            mode: searchParams.get("mode") ?? undefined,
            variant: searchParams.get("variant") ?? undefined,
            limit: searchParams.get("limit") ?? undefined,
            offset: searchParams.get("offset") ?? undefined,
        });

        const banchoId = apiUserIdSchema.parse(userId);
        const [games, total] = await Promise.all([getUserLatestGamesAction(banchoId, query.mode, query.variant, query.limit, query.offset), getUserGamesCountAction(banchoId, query.mode, query.variant)]);

        return NextResponse.json({
            success: true,
            data: games,
            meta: {
                total,
                offset: query.offset,
                limit: query.limit,
            },
        });
    }, { fallbackMessage: "Failed to fetch user games", logLabel: "Games error" });
}
