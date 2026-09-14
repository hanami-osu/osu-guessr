import { prisma } from "@/lib/database/prisma";
import redisClient from "@/lib/redis";
import { refreshScorePpPairPool, SCORE_PP_PAIR_TARGET } from "@/lib/score-pp/pool";

function readCount(): number {
    const argument = process.argv.find((value) => value.startsWith("--count="));
    const count = argument ? Number(argument.slice("--count=".length)) : SCORE_PP_PAIR_TARGET;
    if (!Number.isSafeInteger(count) || count <= 0 || count > 10_000) throw new Error("--count must be an integer between 1 and 10000");
    return count;
}

try {
    const result = await refreshScorePpPairPool({ force: true, targetCount: readCount() });
    console.log(`Activated Score PP batch ${result.batchId} with ${result.pairCount} pair(s).`);
} finally {
    await prisma.$disconnect();
    if (redisClient.isOpen) await redisClient.quit();
}
