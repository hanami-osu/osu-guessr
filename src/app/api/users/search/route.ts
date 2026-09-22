import { NextResponse } from "next/server";
import { searchUsersAction } from "@/actions/user-server";
import { z } from "zod";
import { withApiKey } from "@/app/api/_lib/handler";

const querySchema = z.object({
    query: z.string().min(2).max(250),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
    return withApiKey(
        request,
        async () => {
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
        },
        { fallbackMessage: "Failed to search users", logLabel: "User search error" },
    );
}
