import { NextResponse } from "next/server";
import { searchUsersAction } from "@/actions/user-server";
import { z } from "zod";
import { validateApiKey } from "@/actions/api-keys-server";
import { apiErrorResponse } from "@/lib/api/errors";

const querySchema = z.object({
    query: z.string().min(2).max(250),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
    const headers = new Headers(request.headers);
    const apiKey = headers.get("X-API-Key");

    try {
        await validateApiKey(apiKey);
        const { searchParams } = new URL(request.url);
        const validated = querySchema.parse({
            query: searchParams.get("query") || "",
            limit: searchParams.get("limit") ?? undefined,
        });

        const users = await searchUsersAction(validated.query, validated.limit);

        return NextResponse.json({
            success: true,
            data: users,
        });
    } catch (error) {
        return apiErrorResponse(error, "Failed to search users", "User search error");
    }
}
