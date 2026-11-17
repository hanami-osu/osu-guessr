import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUserIdSchema } from "@/app/api/_lib/schemas";
import { createAccountDeletionService } from "@/lib/account-deletion";
import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { hasValidInternalSecret } from "@/lib/internal-auth";
import { removeMultiplayerUser } from "@/lib/multiplayer";
import redisClient from "@/lib/redis";

const bodySchema = z.object({
    banchoId: apiUserIdSchema,
    action: z.enum(["hide", "restore", "purge"]),
});

const accountDeletion = createAccountDeletionService({
    prisma,
    redis: { del: (keys) => redisClient.del(keys) },
    removeMultiplayerUser,
});

export async function POST(request: Request) {
    const secret = env.HANAMI_INTERNAL_SECRET;
    if (!secret) {
        return NextResponse.json({ ok: false, error: "Account deletion is not configured" }, { status: 503 });
    }

    if (!hasValidInternalSecret(request.headers.get("Authorization"), secret)) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
        return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    try {
        await accountDeletion.run(body.data.action, body.data.banchoId);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`Account deletion ${body.data.action} failed:`, error);
        return NextResponse.json({ ok: false, error: "Account deletion failed" }, { status: 500 });
    }
}
