"use server";

import { GameVariant } from "@/app/games/config";
import { query } from "@/lib/database/database";
import { prisma } from "@/lib/database/prisma";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";
import { calculateProfilePp } from "@/lib/game/performance-points";
import { hasPlayedGame } from "@/lib/user-stats";
import { z } from "zod";
import { Game, GameMode, HighestStats, TopPlayer, User, UserAchievement, UserBadge, UserLifetimeModeStats, UserRankHistoryPoint, UserWithStats } from "./types";

const gameModeSchema = z.nativeEnum(GameMode);
const gameVariantSchema = z.enum(["classic", "survival", "death"]);
const currentGameVariants = ["classic", "survival"] as const;
const searchSchema = z.object({
    term: z.string().min(2).max(250),
    limit: z.number().min(1).max(100).default(10),
    offset: z.number().int().min(0).default(0),
});

type UserRow = Awaited<ReturnType<typeof prisma.user.findFirstOrThrow>>;
type AchievementRow = Awaited<ReturnType<typeof prisma.userAchievement.findFirstOrThrow>>;
type GameRow = Awaited<ReturnType<typeof prisma.game.findFirstOrThrow>>;

function mapUser(user: UserRow, badges: UserBadge[] = []): User {
    return {
        bancho_id: user.banchoId,
        username: user.username,
        avatar_url: user.avatarUrl,
        created_at: user.createdAt,
        badges,
    };
}

function mapAchievement(achievement: AchievementRow): UserAchievement {
    return {
        user_id: achievement.userId,
        game_mode: achievement.gameMode as GameMode,
        variant: achievement.variant,
        ruleset_version: achievement.rulesetVersion,
        pp_version: achievement.ppVersion,
        total_score: achievement.totalScore,
        games_played: achievement.gamesPlayed,
        rounds_played: achievement.roundsPlayed,
        total_correct: achievement.totalCorrect,
        total_skips: achievement.totalSkips,
        total_timeouts: achievement.totalTimeouts,
        total_response_time_ms: achievement.totalResponseTimeMs,
        highest_streak: achievement.highestStreak,
        highest_score: achievement.highestScore,
        best_run_pp: Number(achievement.bestRunPp),
        profile_pp: Number(achievement.profilePp),
        last_played: achievement.lastPlayed,
    };
}

function mapGame(game: GameRow): Game {
    return {
        id: game.id.toString(),
        user_id: game.userId,
        game_mode: game.gameMode as GameMode,
        points: game.points,
        streak: game.streak,
        variant: game.variant,
        ruleset_version: game.rulesetVersion,
        pp_version: game.ppVersion,
        pp: Number(game.pp),
        ended_at: game.endedAt,
    };
}

async function getBadgesForUsers(userIds: number[]): Promise<Map<number, UserBadge[]>> {
    if (userIds.length === 0) return new Map();

    const assignments = await prisma.userBadge.findMany({ where: { userId: { in: userIds } } });
    const badgeNames = [...new Set(assignments.map((assignment) => assignment.badgeName))];
    const badges = badgeNames.length === 0 ? [] : await prisma.badge.findMany({ where: { name: { in: badgeNames } } });
    const badgeByName = new Map(badges.map((badge) => [badge.name, badge]));
    const result = new Map<number, UserBadge[]>();

    for (const assignment of assignments) {
        const badge = badgeByName.get(assignment.badgeName);
        if (!badge) continue;
        const userBadges = result.get(assignment.userId) ?? [];
        userBadges.push({ name: badge.name, color: badge.color, assigned_at: assignment.assignedAt });
        result.set(assignment.userId, userBadges);
    }

    return result;
}

async function getGlobalRank(userId: number, variant: GameVariant): Promise<number> {
    const achievements = await prisma.userAchievement.findMany({
        where: {
            variant,
            rulesetVersion: CURRENT_RULESET_VERSION,
            ppVersion: CURRENT_PP_VERSION,
        },
        select: {
            userId: true,
            profilePp: true,
        },
    });

    const ppByUser = new Map<number, number[]>();
    for (const achievement of achievements) {
        const values = ppByUser.get(achievement.userId) ?? [];
        values.push(Number(achievement.profilePp));
        ppByUser.set(achievement.userId, values);
    }

    const weightedTotals = [...ppByUser.entries()].map(([rankedUserId, values]) => ({
        userId: rankedUserId,
        pp: calculateProfilePp(values),
    }));
    const userPp = weightedTotals.find((entry) => entry.userId === userId)?.pp ?? 0;
    return weightedTotals.filter((entry) => entry.pp > userPp).length + 1;
}

export async function getUserByIdAction(banchoId: number): Promise<UserWithStats | null> {
    const userRow = await prisma.user.findUnique({ where: { banchoId } });
    if (!userRow) return null;

    const achievementRows = await prisma.userAchievement.findMany({
        where: {
            userId: banchoId,
            rulesetVersion: CURRENT_RULESET_VERSION,
            ppVersion: CURRENT_PP_VERSION,
        },
    });
    const achievements = achievementRows.map(mapAchievement);
    const badgesByUser = await getBadgesForUsers([banchoId]);
    const [classicGlobalRank, survivalGlobalRank] = await Promise.all([getGlobalRank(banchoId, "classic"), getGlobalRank(banchoId, "survival")]);
    const modeRanks: { [key in GameMode]: { classic?: number; survival?: number; death?: number } } = {
        [GameMode.Background]: {},
        [GameMode.Audio]: {},
        [GameMode.Skin]: {},
    };

    await Promise.all(
        (Object.keys(modeRanks) as GameMode[]).flatMap((mode) =>
            currentGameVariants.map(async (variant) => {
                const achievement = achievementRows.find((row) => row.gameMode === mode && row.variant === variant);
                if (!achievement || achievement.gamesPlayed === 0) return;
                const rank = await prisma.userAchievement.count({
                    where: {
                        gameMode: mode,
                        variant,
                        rulesetVersion: CURRENT_RULESET_VERSION,
                        ppVersion: CURRENT_PP_VERSION,
                        profilePp: { gt: achievement.profilePp },
                    },
                });
                modeRanks[mode][variant] = rank + 1;
            }),
        ),
    );

    return {
        ...mapUser(userRow, badgesByUser.get(banchoId) ?? []),
        achievements,
        ranks: {
            globalRank: {
                classic: hasPlayedGame(achievements, "classic") ? classicGlobalRank : undefined,
                survival: hasPlayedGame(achievements, "survival") ? survivalGlobalRank : undefined,
            },
            modeRanks,
        },
    };
}

export async function getUserStatsAction(banchoId: number, variant?: GameVariant): Promise<Array<UserAchievement>> {
    const validatedVariant = variant ? gameVariantSchema.parse(variant) : undefined;
    const rows = await prisma.userAchievement.findMany({
        where: {
            userId: banchoId,
            rulesetVersion: CURRENT_RULESET_VERSION,
            ppVersion: CURRENT_PP_VERSION,
            ...(validatedVariant ? { variant: validatedVariant } : {}),
        },
    });
    return rows.map(mapAchievement);
}

export async function getUserLatestGamesAction(
    banchoId: number,
    gameMode?: GameMode,
    variant: GameVariant = "classic",
    limit?: number,
    offset: number = 0,
    endedAfter?: Date,
): Promise<Array<Game>> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const validatedVariant = gameVariantSchema.parse(variant);
    const pagination = z
        .object({
            limit: z.number().int().min(1).max(100).optional(),
            offset: z.number().int().min(0).default(0),
        })
        .parse({ limit, offset });
    const rows = await prisma.game.findMany({
        where: {
            userId: banchoId,
            variant: validatedVariant,
            ranked: true,
            ...(endedAfter ? { endedAt: { gte: endedAfter } } : {}),
            ...(validatedMode ? { gameMode: validatedMode } : {}),
        },
        orderBy: { endedAt: "desc" },
        ...(pagination.limit ? { take: pagination.limit, skip: pagination.offset } : {}),
    });
    return rows.map(mapGame);
}

export async function getUserGamesCountAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic"): Promise<number> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const validatedVariant = gameVariantSchema.parse(variant);
    return prisma.game.count({
        where: {
            userId: banchoId,
            variant: validatedVariant,
            ranked: true,
            ...(validatedMode ? { gameMode: validatedMode } : {}),
        },
    });
}

export async function getUserLifetimeModeStatsAction(banchoId: number, gameMode: GameMode, variant: GameVariant = "classic"): Promise<UserLifetimeModeStats> {
    const validatedMode = gameModeSchema.parse(gameMode);
    const validatedVariant = gameVariantSchema.parse(variant);
    const stats = await prisma.game.aggregate({
        where: {
            userId: banchoId,
            gameMode: validatedMode,
            variant: validatedVariant,
            ranked: true,
        },
        _count: { _all: true },
        _sum: { points: true },
        _avg: { streak: true },
        _max: {
            points: true,
            streak: true,
            endedAt: true,
        },
    });

    return {
        games_played: stats._count._all,
        total_score: BigInt(stats._sum.points ?? 0),
        highest_score: stats._max.points ?? 0,
        highest_streak: stats._max.streak ?? 0,
        average_streak: stats._avg.streak ?? 0,
        last_played: stats._max.endedAt,
    };
}

export async function getUserRankHistoryAction(
    banchoId: number,
    gameMode: GameMode,
    variant: GameVariant = "classic",
    days: number = 60,
): Promise<UserRankHistoryPoint[]> {
    const validatedMode = gameModeSchema.parse(gameMode);
    const validated = z.object({ variant: gameVariantSchema, days: z.number().int().min(1).max(60) }).parse({ variant, days });
    const now = new Date();
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const windowStart = new Date(todayStart - (validated.days - 1) * 86_400_000);

    const targetHasPlayedBeforeWindow =
        (await prisma.game.count({
            where: {
                userId: banchoId,
                gameMode: validatedMode,
                variant: validated.variant,
                rulesetVersion: CURRENT_RULESET_VERSION,
                ppVersion: CURRENT_PP_VERSION,
                ranked: true,
                endedAt: { lt: windowStart },
            },
        })) > 0;

    type BaselineRun = { user_id: number; pp: number };
    const baselineRuns = await query<BaselineRun>(
        `WITH ranked_runs AS (
            SELECT
                user_id,
                pp,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY pp DESC, ended_at ASC, id ASC) AS run_position
            FROM games
            WHERE game_mode = ?
              AND variant = ?
              AND ruleset_version = ?
              AND pp_version = ?
              AND ranked = TRUE
              AND pp > 0
              AND ended_at < ?
        )
        SELECT user_id, pp
        FROM ranked_runs
        WHERE run_position <= 100`,
        [validatedMode, validated.variant, CURRENT_RULESET_VERSION, CURRENT_PP_VERSION, windowStart],
    );

    const topRunsByUser = new Map<number, number[]>();
    for (const run of baselineRuns) {
        const runs = topRunsByUser.get(run.user_id) ?? [];
        runs.push(Number(run.pp));
        topRunsByUser.set(run.user_id, runs);
    }

    const profilePpByUser = new Map<number, number>();
    for (const [userId, runs] of topRunsByUser) {
        profilePpByUser.set(userId, calculateProfilePp(runs));
    }

    const events = await prisma.game.findMany({
        where: {
            gameMode: validatedMode,
            variant: validated.variant,
            rulesetVersion: CURRENT_RULESET_VERSION,
            ppVersion: CURRENT_PP_VERSION,
            ranked: true,
            endedAt: { gte: windowStart, lte: now },
        },
        select: { userId: true, pp: true, endedAt: true },
        orderBy: [{ endedAt: "asc" }, { id: "asc" }],
    });

    const history: UserRankHistoryPoint[] = [];
    let eventIndex = 0;
    let targetHasPlayed = targetHasPlayedBeforeWindow;

    for (let day = 0; day < validated.days; day += 1) {
        const dayStart = todayStart - (validated.days - 1 - day) * 86_400_000;
        const nextDayStart = dayStart + 86_400_000;
        const dayCutoff = Math.min(nextDayStart - 1, now.getTime());

        while (eventIndex < events.length && events[eventIndex].endedAt.getTime() <= dayCutoff) {
            const event = events[eventIndex];
            const runPp = Number(event.pp);

            if (event.userId === banchoId) targetHasPlayed = true;

            if (runPp > 0) {
                const runs = topRunsByUser.get(event.userId) ?? [];
                runs.push(runPp);
                runs.sort((a, b) => b - a);
                if (runs.length > 100) runs.length = 100;
                topRunsByUser.set(event.userId, runs);
                profilePpByUser.set(event.userId, calculateProfilePp(runs));
            }

            eventIndex += 1;
        }

        if (!targetHasPlayed) continue;

        const targetPp = profilePpByUser.get(banchoId) ?? 0;
        let rank = 1;
        for (const profilePp of profilePpByUser.values()) {
            if (profilePp > targetPp) rank += 1;
        }

        history.push({ rank, recorded_at: new Date(dayCutoff) });
    }

    return history;
}

export async function getUserTopGamesAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic", limit: number = 5): Promise<Array<Game>> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const validated = z.object({ variant: gameVariantSchema, limit: z.number().int().min(1).max(100) }).parse({ variant, limit });
    const rows = await prisma.game.findMany({
        where: {
            userId: banchoId,
            variant: validated.variant,
            ranked: true,
            ...(validatedMode ? { gameMode: validatedMode } : {}),
        },
        orderBy: [{ pp: "desc" }, { endedAt: "desc" }],
        take: validated.limit,
    });
    return rows.map(mapGame);
}

export async function getTopPlayersAction(
    gamemode: GameMode,
    variant: GameVariant = "classic",
    limit: number = 10,
    orderMetricOrOffset: "total" | "highest" | number = "highest",
    offset: number = 0,
): Promise<Array<TopPlayer>> {
    const resolvedOffset = typeof orderMetricOrOffset === "number" ? orderMetricOrOffset : offset;
    const validated = z
        .object({ gamemode: gameModeSchema, variant: gameVariantSchema, limit: z.number().int().min(1).max(100), offset: z.number().int().min(0) })
        .parse({ gamemode, variant, limit, offset: resolvedOffset });
    const achievements = await prisma.userAchievement.findMany({
        where: {
            gameMode: validated.gamemode,
            variant: validated.variant,
            rulesetVersion: CURRENT_RULESET_VERSION,
            ppVersion: CURRENT_PP_VERSION,
        },
        orderBy: [{ profilePp: "desc" }, { bestRunPp: "desc" }, { lastPlayed: "asc" }, { userId: "asc" }],
        take: validated.limit,
        skip: validated.offset,
    });
    const userIds = achievements.map((achievement) => achievement.userId);
    const [users, badgesByUser] = await Promise.all([
        userIds.length === 0 ? [] : prisma.user.findMany({ where: { banchoId: { in: userIds } } }),
        getBadgesForUsers(userIds),
    ]);
    const usersById = new Map(users.map((user) => [user.banchoId, user]));

    return achievements.flatMap((achievement) => {
        const user = usersById.get(achievement.userId);
        if (!user) return [];
        return [
            {
                ...mapUser(user),
                badges: (badgesByUser.get(user.banchoId) ?? []).map(({ name, color }) => ({ name, color })),
                total_score: achievement.totalScore,
                games_played: achievement.gamesPlayed,
                highest_streak: achievement.highestStreak,
                highest_score: achievement.highestScore,
                best_run_pp: Number(achievement.bestRunPp),
                profile_pp: Number(achievement.profilePp),
                last_played: achievement.lastPlayed,
            },
        ];
    });
}

export async function searchUsersAction(searchTerm: string, limit: number = 10): Promise<Array<User>> {
    const validated = searchSchema.parse({ term: searchTerm, limit });
    const users = await prisma.user.findMany({
        where: { username: { contains: validated.term } },
        orderBy: [{ username: "asc" }, { banchoId: "asc" }],
        take: validated.limit,
    });
    return users.map((user) => mapUser(user));
}

export async function searchUsersPageAction(searchTerm: string, limit: number = 10, offset: number = 0): Promise<{ users: Array<User>; total: number }> {
    const validated = searchSchema.parse({ term: searchTerm, limit, offset });
    const where = { username: { contains: validated.term } };
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            orderBy: [{ username: "asc" }, { banchoId: "asc" }],
            take: validated.limit,
            skip: validated.offset,
        }),
        prisma.user.count({ where }),
    ]);

    return { users: users.map((user) => mapUser(user)), total };
}

export async function getHighestStatsAction(variant: GameVariant = "classic"): Promise<HighestStats> {
    const validatedVariant = gameVariantSchema.parse(variant);
    const competitiveWhere = {
        variant: validatedVariant,
        rulesetVersion: CURRENT_RULESET_VERSION,
        ppVersion: CURRENT_PP_VERSION,
        ranked: true,
    } as const;
    const [totalUsers, totalGames, maxima] = await Promise.all([
        prisma.user.count(),
        prisma.game.count({ where: { variant: validatedVariant, ranked: true } }),
        prisma.game.aggregate({ where: competitiveWhere, _max: { points: true, streak: true, pp: true } }),
    ]);

    return {
        total_users: totalUsers,
        total_games: totalGames,
        highest_points: validatedVariant === "classic" ? maxima._max.points ?? 0 : maxima._max.streak ?? 0,
        highest_run_pp: Number(maxima._max.pp ?? 0),
    };
}
