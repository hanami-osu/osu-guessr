import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { OsuApiScoreSource } from "@/lib/score-pp/osu-api-source";
import { generateScorePpPair } from "@/lib/score-pp/pairing";
import { storeScorePpPair } from "@/lib/score-pp/store";

function readCount(): number {
    const argument = process.argv.find((value) => value.startsWith("--count="));
    const count = argument ? Number(argument.slice("--count=".length)) : 250;
    if (!Number.isSafeInteger(count) || count <= 0 || count > 10_000) throw new Error("--count must be an integer between 1 and 10000");
    return count;
}

async function main(): Promise<void> {
    if (!env.OSU_CLIENT_ID || !env.OSU_CLIENT_SECRET) {
        throw new Error("OSU_CLIENT_ID and OSU_CLIENT_SECRET are required to prepare Score PP pairs");
    }

    const count = readCount();
    const source = await OsuApiScoreSource.create(env.OSU_CLIENT_ID, env.OSU_CLIENT_SECRET);
    const usedScoreIds = new Set<string>();
    const usedUserIds = new Set<number>();
    const usedBeatmapIds = new Set<number>();
    const createdIds = new Set<number>();
    let misses = 0;

    try {
        while (createdIds.size < count && misses < Math.max(50, count * 4)) {
            const round = 1 + (createdIds.size % 15);
            const pair = await generateScorePpPair(source, source, round, {
                exclusions: { scoreIds: usedScoreIds, userIds: usedUserIds, beatmapIds: usedBeatmapIds },
            });
            if (!pair) {
                misses += 1;
                if (usedScoreIds.size > 0 || usedUserIds.size > 0 || usedBeatmapIds.size > 0) {
                    usedScoreIds.clear();
                    usedUserIds.clear();
                    usedBeatmapIds.clear();
                }
                continue;
            }

            const id = await storeScorePpPair("osu_api", pair);
            createdIds.add(id);
            usedScoreIds.add(pair.left.sourceScoreId);
            usedScoreIds.add(pair.right.sourceScoreId);
            usedUserIds.add(pair.left.player.userId);
            usedUserIds.add(pair.right.player.userId);
            usedBeatmapIds.add(pair.left.beatmap.beatmapId);
            usedBeatmapIds.add(pair.right.beatmap.beatmapId);
            misses = 0;
        }
    } finally {
        await source.close();
    }

    console.log(`Prepared ${createdIds.size} Score PP pair(s).`);
    if (createdIds.size < count) throw new Error(`Only ${createdIds.size} eligible pair(s) could be prepared from osu!`);
}

try {
    await main();
} finally {
    await prisma.$disconnect();
}
