import { prisma } from "@/lib/database/prisma";
import { calculateArcadeScoreFromRound } from "@/lib/game/arcade-score";
import { rebuildUserAchievementCache } from "@/lib/game/achievement-cache";
import { CURRENT_RULESET_VERSION } from "@/lib/game/versioning";

async function main(): Promise<void> {
    const dryRun = process.argv.includes("--dry-run");
    const candidates = await prisma.game.findMany({
        where: {
            rulesetVersion: CURRENT_RULESET_VERSION,
            points: 0,
            roundsPlayed: { gt: 0 },
        },
        select: { id: true },
    });

    if (candidates.length === 0) {
        console.log("No zero-score v1 runs found.");
        return;
    }

    const gameIds = candidates.map(({ id }) => id);
    const rounds = await prisma.gameRound.findMany({
        where: { gameId: { in: gameIds } },
        select: {
            id: true,
            gameId: true,
            correct: true,
            responseTimeMs: true,
            timeLimitMs: true,
            pointsEarned: true,
            streakBefore: true,
        },
        orderBy: [{ gameId: "asc" }, { roundNumber: "asc" }],
    });

    const roundsByGame = new Map<bigint, typeof rounds>();
    for (const round of rounds) {
        const gameRounds = roundsByGame.get(round.gameId) ?? [];
        gameRounds.push(round);
        roundsByGame.set(round.gameId, gameRounds);
    }

    const backfills = candidates.flatMap(({ id }) => {
        const gameRounds = roundsByGame.get(id) ?? [];
        if (gameRounds.length === 0 || gameRounds.some((round) => round.pointsEarned !== 0)) return [];

        const scoredRounds = gameRounds.map((round) => ({
            id: round.id,
            points: calculateArcadeScoreFromRound(round),
        }));

        return [{ gameId: id, points: scoredRounds.reduce((total, round) => total + round.points, 0), rounds: scoredRounds }];
    });

    console.log(`${dryRun ? "Would backfill" : "Backfilling"} ${backfills.length} run(s) and ${backfills.reduce((total, game) => total + game.rounds.length, 0)} round(s).`);

    if (dryRun || backfills.length === 0) return;

    await prisma.$transaction(async (tx) => {
        for (const game of backfills) {
            for (const round of game.rounds) {
                await tx.gameRound.update({ where: { id: round.id }, data: { pointsEarned: round.points } });
            }
            await tx.game.update({ where: { id: game.gameId }, data: { points: game.points } });
        }
    });

    await rebuildUserAchievementCache();
    console.log("Arcade scores backfilled and user achievement totals rebuilt.");
}

try {
    await main();
} finally {
    await prisma.$disconnect();
}
