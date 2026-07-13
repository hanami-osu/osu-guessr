import { NextResponse } from "next/server";
import redisClient from "@/lib/redis";
import { query } from "@/lib/database";
import { getApplicationHealth } from "@/lib/health";

export async function GET() {
    const health = await getApplicationHealth(
        {
            redisPing: () => redisClient.ping(),
            mariaDbPing: () => query("SELECT 1"),
        },
        process.env.NEXT_DEPLOYMENT_ID
    );

    return NextResponse.json(health.body, { status: health.status });
}
