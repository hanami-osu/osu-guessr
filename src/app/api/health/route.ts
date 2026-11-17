import { NextResponse } from "next/server";
import redisClient from "@/lib/infra/redis";
import { prisma } from "@/lib/database/prisma";
import { getApplicationHealth } from "@/lib/infra/health";

export async function GET() {
    const health = await getApplicationHealth(
        {
            redisPing: () => redisClient.ping(),
            mariaDbPing: () => prisma.user.findFirst({ select: { banchoId: true } }),
        },
        process.env.NEXT_DEPLOYMENT_ID,
    );

    return NextResponse.json(health.body, { status: health.status });
}
