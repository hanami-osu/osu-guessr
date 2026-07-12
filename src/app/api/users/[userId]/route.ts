import { NextResponse } from "next/server";
import { validateApiKey } from "@/actions/api-keys-server";
import { getUserByIdAction } from "@/actions/user-server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/errors";

const userIdSchema = z.coerce.number().int().positive();

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    const headers = new Headers(request.headers);
    const apiKey = headers.get("X-API-Key");

    try {
        await validateApiKey(apiKey);
        const { userId } = await params;
        const user = await getUserByIdAction(userIdSchema.parse(userId));

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: user,
        });
    } catch (error) {
        return apiErrorResponse(error, "Failed to fetch user", "User fetch error");
    }
}
