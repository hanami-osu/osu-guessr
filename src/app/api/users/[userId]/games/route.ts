import { NextResponse } from "next/server";
import { validateApiKey } from "@/actions/api-keys-server";
import { getUserGamesCountAction, getUserLatestGamesAction } from "@/actions/user-server";
import { GameMode } from "@/actions/types";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/errors";

const querySchema = z.object({
    mode: z.nativeEnum(GameMode).optional(),
    variant: z.enum(["classic", "death"]).default("classic"),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});
const userIdSchema = z.coerce.number().int().positive();

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    const headers = new Headers(request.headers);
    const apiKey = headers.get("X-API-Key");

    try {
        await validateApiKey(apiKey);
        const { userId } = await params;
        const { searchParams } = new URL(request.url);
        const query = querySchema.parse({
            mode: searchParams.get("mode") ?? undefined,
            variant: searchParams.get("variant") ?? undefined,
            limit: searchParams.get("limit") ?? undefined,
            offset: searchParams.get("offset") ?? undefined,
        });

        const banchoId = userIdSchema.parse(userId);
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
    } catch (error) {
        return apiErrorResponse(error, "Failed to fetch user games", "Games error");
    }
}
