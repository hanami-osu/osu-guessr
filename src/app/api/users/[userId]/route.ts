import { NextResponse } from "next/server";
import { getUserByIdAction } from "@/actions/user-server";
import { normalizeDatabaseValue } from "@/lib/database/normalize";
import { withApiKey } from "@/app/api/_lib/handler";
import { apiUserIdSchema } from "@/app/api/_lib/schemas";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
    return withApiKey(request, async () => {
        const { userId } = await params;
        const user = await getUserByIdAction(apiUserIdSchema.parse(userId));

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: normalizeDatabaseValue(user),
        });
    }, { fallbackMessage: "Failed to fetch user", logLabel: "User fetch error" });
}
