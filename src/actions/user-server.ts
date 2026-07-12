"use server";

import { query } from "@/lib/database";
import { z } from "zod";
import { authenticatedAction } from "./server";
import { OWNER_ID } from "@/lib";
import { GameVariant } from "@/app/games/config";
import { Game, GameMode, HighestStats, TopPlayer, User, UserAchievement, UserWithStats, UserRanks, UserBadge } from "./types";
import { hasPlayedGame } from "@/lib/user-stats";

export type { UserRanks };

// Schemas
const gameModeSchema = z.nativeEnum(GameMode);
const searchSchema = z.object({
    term: z.string().min(2).max(250),
    limit: z.number().min(1).max(100).default(10),
});

// Server actions
export async function createUserAction(banchoId: number, username: string, avatar_url: string) {
    return query(
        `INSERT INTO users (bancho_id, username, avatar_url)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            avatar_url = VALUES(avatar_url)`,
        [banchoId, username, avatar_url]
    );
}

export async function deleteUserAction(banchoId: number) {
    return authenticatedAction(async (session) => {
        const targetBanchoId = z.coerce.number().int().min(1).parse(banchoId);

        if (session.user.banchoId !== targetBanchoId && session.user.banchoId !== OWNER_ID) {
            throw new Error("Forbidden");
        }

        await query("DELETE FROM users WHERE bancho_id = ?", [targetBanchoId]);
        return { success: true };
    });
}

export async function getUserByIdAction(banchoId: number): Promise<UserWithStats | null> {
    const userResult = (await query(`SELECT * FROM users WHERE bancho_id = ?`, [banchoId])) as User[];

    if (!userResult[0]) return null;
    const user = userResult[0];

    const badges = (await query(
        `SELECT b.name, b.color, ub.assigned_at
         FROM user_badges ub
         JOIN badges b ON ub.badge_name = b.name
         WHERE ub.user_id = ?`,
        [banchoId]
    )) as UserBadge[];

    const achievements = (await query(
        `SELECT g.user_id, g.game_mode, g.variant,
                COUNT(*) as games_played,
                MAX(CASE WHEN g.variant = 'classic' THEN g.points ELSE 0 END) as highest_score,
                MAX(g.streak) as highest_streak,
                SUM(CASE WHEN g.variant = 'classic' THEN g.points ELSE 0 END) as total_score,
                MAX(g.ended_at) as last_played
         FROM games g
         WHERE g.user_id = ?
         GROUP BY g.user_id, g.game_mode, g.variant`,
        [banchoId]
    )) as UserAchievement[];

    const globalClassicRankResult = (await query(
        `WITH RankedUsers AS (
            SELECT user_id, SUM(points) as total_score
            FROM games
            WHERE variant = 'classic'
            GROUP BY user_id
            ORDER BY total_score DESC
        )
        SELECT COUNT(*) as globalRank
        FROM RankedUsers r
        WHERE r.total_score > (
            SELECT COALESCE(SUM(points), 0)
            FROM games
            WHERE user_id = ? AND variant = 'classic'
        )`,
        [banchoId]
    )) as [{ globalRank: number }];

    const globalDeathRankResult = (await query(
        `WITH RankedUsers AS (
            SELECT user_id, MAX(streak) as highest_streak
            FROM games
            WHERE variant = 'death'
            GROUP BY user_id
            ORDER BY highest_streak DESC
        )
        SELECT COUNT(*) as globalRank
        FROM RankedUsers r
        WHERE r.highest_streak > (
            SELECT COALESCE(MAX(streak), 0)
            FROM games
            WHERE user_id = ? AND variant = 'death'
        )`,
        [banchoId]
    )) as [{ globalRank: number }];

    const modeRanks: { [key in GameMode]: { classic?: number; death?: number } } = {
        [GameMode.Background]: {},
        [GameMode.Audio]: {},
        [GameMode.Skin]: {},
    };

    for (const mode of Object.keys(modeRanks) as GameMode[]) {
        const classicRank = (await query(
            `WITH RankedUsers AS (
                SELECT user_id, SUM(points) as total_score
                FROM games
                WHERE game_mode = ? AND variant = 'classic'
                GROUP BY user_id
                ORDER BY total_score DESC
            )
            SELECT COUNT(*) as rank
            FROM RankedUsers r
            WHERE r.total_score > (
                SELECT COALESCE(SUM(points), 0)
                FROM games
                WHERE user_id = ? AND game_mode = ? AND variant = 'classic'
            )`,
            [mode, banchoId, mode]
        )) as [{ rank: number }];

        const deathRank = (await query(
            `WITH RankedUsers AS (
                SELECT user_id, MAX(streak) as highest_streak
                FROM games
                WHERE game_mode = ? AND variant = 'death'
                GROUP BY user_id
                ORDER BY highest_streak DESC
            )
            SELECT COUNT(*) as rank
            FROM RankedUsers r
            WHERE r.highest_streak > (
                SELECT COALESCE(MAX(streak), 0)
                FROM games
                WHERE user_id = ? AND game_mode = ? AND variant = 'death'
            )`,
            [mode, banchoId, mode]
        )) as [{ rank: number }];

        modeRanks[mode] = {
            classic: hasPlayedGame(achievements, "classic", mode) ? classicRank[0].rank + 1 : undefined,
            death: hasPlayedGame(achievements, "death", mode) ? deathRank[0].rank + 1 : undefined,
        };
    }

    return {
        ...user,
        badges,
        achievements,
        ranks: {
            globalRank: {
                classic: hasPlayedGame(achievements, "classic") ? globalClassicRankResult[0].globalRank + 1 : undefined,
                death: hasPlayedGame(achievements, "death") ? globalDeathRankResult[0].globalRank + 1 : undefined,
            },
            modeRanks,
        },
    };
}

export async function getUserStatsAction(banchoId: number): Promise<Array<UserAchievement>> {
    const result = (await query(
        `SELECT user_id, game_mode, total_score, games_played,
                highest_streak, highest_score, last_played
         FROM user_achievements
         WHERE user_id = ?`,
        [banchoId]
    )) as UserAchievement[];
    return result;
}

export async function getUserLatestGamesAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic", limit?: number, offset: number = 0): Promise<Array<Game>> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const pagination = z
        .object({
            limit: z.number().int().min(1).max(100).optional(),
            offset: z.number().int().min(0).default(0),
        })
        .parse({ limit, offset });

    let query_string = validatedMode
        ? `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND game_mode = ? AND variant = ?
           ORDER BY ended_at DESC`
        : `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND variant = ?
           ORDER BY ended_at DESC`;

    const params = validatedMode ? [banchoId, validatedMode, variant] : [banchoId, variant];

    if (pagination.limit) {
        query_string += " LIMIT ? OFFSET ?";
        params.push(pagination.limit, pagination.offset);
    }

    return query(query_string, params);
}

export async function getUserGamesCountAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic"): Promise<number> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const queryString = validatedMode
        ? `SELECT COUNT(*) as total FROM games WHERE user_id = ? AND game_mode = ? AND variant = ?`
        : `SELECT COUNT(*) as total FROM games WHERE user_id = ? AND variant = ?`;
    const params = validatedMode ? [banchoId, validatedMode, variant] : [banchoId, variant];
    const [row] = (await query(queryString, params)) as Array<{ total: number }>;

    return row?.total ?? 0;
}

export async function getUserTopGamesAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic"): Promise<Array<Game>> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;

    const orderBy = variant === "classic" ? "points" : "streak";

    const query_string = validatedMode
        ? `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND game_mode = ? AND variant = ?
           ORDER BY ${orderBy} DESC, ended_at ASC`
        : `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND variant = ?
           ORDER BY ${orderBy} DESC, ended_at ASC`;

    const params = validatedMode ? [banchoId, validatedMode, variant] : [banchoId, variant];

    return query(query_string, params);
}

export async function getTopPlayersAction(gamemode: GameMode, variant: GameVariant = "classic", limit: number = 10, orderMetric: "total" | "highest" = "highest", offset: number = 0): Promise<Array<TopPlayer>> {
    const validatedMode = gameModeSchema.parse(gamemode);

    let query_string: string;

    if (variant === "death") {
        query_string = `SELECT u.*,
                COUNT(*) as games_played,
                MAX(g.streak) as highest_streak,
                0 as highest_score,
                0 as total_score,
                MIN(g.ended_at) as earliest_ended_at,
                GROUP_CONCAT(DISTINCT CONCAT(b.name, ':', b.color)) as badges
         FROM games g
         JOIN users u ON g.user_id = u.bancho_id
         LEFT JOIN user_badges ub ON u.bancho_id = ub.user_id
         LEFT JOIN badges b ON ub.badge_name = b.name
         WHERE g.game_mode = ? AND g.variant = 'death'
         GROUP BY g.user_id
      ORDER BY highest_streak DESC, earliest_ended_at ASC
         LIMIT ? OFFSET ?`;
    } else {
        const orderColumn = orderMetric === "highest" ? "highest_score" : "total_score";
        query_string = `SELECT u.*,
                COUNT(*) as games_played,
                MAX(g.streak) as highest_streak,
                MAX(g.points) as highest_score,
                SUM(g.points) as total_score,
          MIN(g.ended_at) as earliest_ended_at,
          GROUP_CONCAT(DISTINCT CONCAT(b.name, ':', b.color)) as badges
         FROM games g
         JOIN users u ON g.user_id = u.bancho_id
         LEFT JOIN user_badges ub ON u.bancho_id = ub.user_id
         LEFT JOIN badges b ON ub.badge_name = b.name
         WHERE g.game_mode = ? AND g.variant = 'classic'
         GROUP BY g.user_id
         ORDER BY ${orderColumn} DESC, earliest_ended_at ASC
         LIMIT ? OFFSET ?`;
    }

    const results = await query(query_string, [validatedMode, limit, offset]);

    /* eslint-disable  @typescript-eslint/no-explicit-any */
    return results.map((player: any) => {
        const processedPlayer = { ...player };

        if (player.badges) {
            const badgeArray = player.badges.split(",").map((badge: string) => {
                const [name, color] = badge.split(":");
                return { name, color };
            });
            processedPlayer.badges = badgeArray;
        } else {
            processedPlayer.badges = [];
        }

        return processedPlayer;
    });
}

export async function searchUsersAction(searchTerm: string, limit: number = 10): Promise<Array<User>> {
    const validated = searchSchema.parse({ term: searchTerm, limit });
    return query(
        `SELECT bancho_id, username, avatar_url, created_at
         FROM users
         WHERE username LIKE ?
         ORDER BY username
         LIMIT ?`,
        [`%${validated.term}%`, validated.limit]
    );
}

export async function getHighestStatsAction(variant: GameVariant = "classic"): Promise<HighestStats> {
    const result = (await query(
        `SELECT
            (SELECT COUNT(*) FROM users) as total_users,
            COUNT(*) as total_games,
            CASE
                WHEN ? = 'classic' THEN COALESCE(MAX(points), 0)
                ELSE COALESCE(MAX(streak), 0)
            END as highest_score
         FROM games
         WHERE variant = ?`,
        [variant, variant]
    )) as [{ total_users: number; total_games: number; highest_score: number }];

    return {
        total_users: Number(result[0].total_users),
        total_games: Number(result[0].total_games),
        highest_points: Number(result[0].highest_score),
    };
}
