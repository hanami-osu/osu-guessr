import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUserIdSchema } from "@/app/api/_lib/schemas";
import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { hasValidInternalSecret } from "@/lib/internal-auth";
import { applySupporterBadge } from "@/lib/supporter";

const bodySchema = z.object({
    banchoId: apiUserIdSchema,
    badge: z.boolean(),
});

/** Hanami Web pushes supporter changes here so badges stay current for players who aren't signing in. */
export async function POST(request: Request) {
    const secret = env.HANAMI_INTERNAL_SECRET;
    if (!secret) {
        return NextResponse.json({ ok: false, error: "Supporter sync is not configured" }, { status: 503 });
    }

    if (!hasValidInternalSecret(request.headers.get("Authorization"), secret)) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    try {
        const { banchoId, badge } = body.data;
        await applySupporterBadge(prisma, banchoId, badge);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Supporter sync failed:", error);
        return NextResponse.json({ ok: false, error: "Supporter sync failed" }, { status: 500 });
    }
}
