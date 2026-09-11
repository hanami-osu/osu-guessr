"use server";

import { requireOwner } from "@/actions/require-owner";
import { prisma } from "@/lib/database/prisma";
import { calculateProfilePp } from "@/lib/game/performance-points";

function achievementKey(parts: { userId: number; gameMode: string; variant: string; rulesetVersion: number; ppVersion: number }): string {
    return [parts.userId, parts.gameMode, parts.variant, parts.rulesetVersion, parts.ppVersion].join(":");
}

export async function syncUserAchievements(): Promise<void> {
    await requireOwner();

    await prisma.$transaction(
        async (tx) => {
            await tx.userAchievement.deleteMany();

            const [groups, runs] = await Promise.all([
                tx.game.groupBy({
                    by: ["userId", "gameMode", "variant", "rulesetVersion", "ppVersion"],
                    where: { ranked: true },
                    _count: { _all: true },
                    _sum: {
                        points: true,
                        roundsPlayed: true,
                        correctCount: true,
                        skipCount: true,
                        timeoutCount: true,
                        totalResponseTimeMs: true,
                    },
                    _max: {
                        streak: true,
                        points: true,
                        pp: true,
                        endedAt: true,
                    },
                }),
                tx.game.findMany({
                    where: { ranked: true, pp: { gt: 0 } },
                    select: {
                        userId: true,
                        gameMode: true,
                        variant: true,
                        rulesetVersion: true,
                        ppVersion: true,
                        pp: true,
                    },
                    orderBy: [
                        { userId: "asc" },
                        { gameMode: "asc" },
                        { variant: "asc" },
                        { rulesetVersion: "asc" },
                        { ppVersion: "asc" },
                        { pp: "desc" },
                        { endedAt: "asc" },
                    ],
                }),
            ]);

            const runPpByAchievement = new Map<string, number[]>();
            for (const run of runs) {
                const key = achievementKey(run);
                const pp = runPpByAchievement.get(key) ?? [];
                if (pp.length < 100) pp.push(Number(run.pp));
                runPpByAchievement.set(key, pp);
            }

            if (groups.length === 0) return;

            await tx.userAchievement.createMany({
                data: groups.map((group) => ({
                    userId: group.userId,
                    gameMode: group.gameMode,
                    variant: group.variant,
                    rulesetVersion: group.rulesetVersion,
                    ppVersion: group.ppVersion,
                    totalScore: group.variant === "classic" ? group._sum.points ?? 0 : 0,
                    gamesPlayed: group._count._all,
                    roundsPlayed: group._sum.roundsPlayed ?? 0,
                    totalCorrect: group._sum.correctCount ?? 0,
                    totalSkips: group._sum.skipCount ?? 0,
                    totalTimeouts: group._sum.timeoutCount ?? 0,
                    totalResponseTimeMs: group._sum.totalResponseTimeMs ?? 0,
                    highestStreak: group._max.streak ?? 0,
                    highestScore: group.variant === "classic" ? group._max.points ?? 0 : 0,
                    bestRunPp: group._max.pp ?? 0,
                    profilePp: calculateProfilePp(runPpByAchievement.get(achievementKey(group)) ?? []),
                    lastPlayed: group._max.endedAt ?? new Date(0),
                })),
            });
        },
        { isolationLevel: "Serializable" },
    );
}
