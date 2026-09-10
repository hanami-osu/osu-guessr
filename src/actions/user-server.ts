"use server";

import { query } from "@/lib/database";
import { z } from "zod";
import { GameVariant } from "@/app/games/config";
import { Game, GameMode, HighestStats, TopPlayer, User, UserAchievement, UserWithStats, UserBadge } from "./types";
import { hasPlayedGame } from "@/lib/user-stats";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "@/lib/game/versioning";

const gameModeSchema = z.nativeEnum(GameMode);
const gameVariantSchema = z.enum(["classic", "death"]);
const searchSchema = z.object({
    term: z.string().min(2).max(250),
    limit: z.number().min(1).max(100).default(10),
});

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
        `SELECT user_id, game_mode, variant, ruleset_version, pp_version, total_score, games_played, rounds_played,
                total_correct, total_skips, total_timeouts, total_response_time_ms, highest_streak, highest_score,
                best_run_pp, profile_pp, last_played
         FROM user_achievements
         WHERE user_id = ? AND ruleset_version = ? AND pp_version = ?`,
        [banchoId, CURRENT_RULESET_VERSION, CURRENT_PP_VERSION]
    )) as UserAchievement[];

    const globalClassicRankResult = (await query(
        `WITH RankedUsers AS (
            SELECT user_id, SUM(points) as total_score
            FROM games
            WHERE variant = 'classic' AND ruleset_version = ? AND ranked = TRUE
            GROUP BY user_id
            ORDER BY total_score DESC
        )
        SELECT COUNT(*) as globalRank
        FROM RankedUsers r
        WHERE r.total_score > (
            SELECT COALESCE(SUM(points), 0)
            FROM games
            WHERE user_id = ? AND variant = 'classic' AND ruleset_version = ? AND ranked = TRUE
        )`,
        [CURRENT_RULESET_VERSION, banchoId, CURRENT_RULESET_VERSION]
    )) as [{ globalRank: number }];

    const globalDeathRankResult = (await query(
        `WITH RankedUsers AS (
            SELECT user_id, MAX(streak) as highest_streak
            FROM games
            WHERE variant = 'death' AND ruleset_version = ? AND ranked = TRUE
            GROUP BY user_id
            ORDER BY highest_streak DESC
        )
        SELECT COUNT(*) as globalRank
        FROM RankedUsers r
        WHERE r.highest_streak > (
            SELECT COALESCE(MAX(streak), 0)
            FROM games
            WHERE user_id = ? AND variant = 'death' AND ruleset_version = ? AND ranked = TRUE
        )`,
        [CURRENT_RULESET_VERSION, banchoId, CURRENT_RULESET_VERSION]
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
                WHERE game_mode = ? AND variant = 'classic' AND ruleset_version = ? AND ranked = TRUE
                GROUP BY user_id
                ORDER BY total_score DESC
            )
            SELECT COUNT(*) as rank
            FROM RankedUsers r
            WHERE r.total_score > (
                SELECT COALESCE(SUM(points), 0)
                FROM games
                WHERE user_id = ? AND game_mode = ? AND variant = 'classic' AND ruleset_version = ? AND ranked = TRUE
            )`,
            [mode, CURRENT_RULESET_VERSION, banchoId, mode, CURRENT_RULESET_VERSION]
        )) as [{ rank: number }];

        const deathRank = (await query(
            `WITH RankedUsers AS (
                SELECT user_id, MAX(streak) as highest_streak
                FROM games
                WHERE game_mode = ? AND variant = 'death' AND ruleset_version = ? AND ranked = TRUE
                GROUP BY user_id
                ORDER BY highest_streak DESC
            )
            SELECT COUNT(*) as rank
            FROM RankedUsers r
            WHERE r.highest_streak > (
                SELECT COALESCE(MAX(streak), 0)
                FROM games
                WHERE user_id = ? AND game_mode = ? AND variant = 'death' AND ruleset_version = ? AND ranked = TRUE
            )`,
            [mode, CURRENT_RULESET_VERSION, banchoId, mode, CURRENT_RULESET_VERSION]
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

export async function getUserStatsAction(banchoId: number, variant?: GameVariant): Promise<Array<UserAchievement>> {
    const validatedVariant = variant ? gameVariantSchema.parse(variant) : undefined;
    const result = (await query(
        `SELECT user_id, game_mode, variant, ruleset_version, pp_version, total_score, games_played, rounds_played,
                total_correct, total_skips, total_timeouts, total_response_time_ms, highest_streak, highest_score,
                best_run_pp, profile_pp, last_played
         FROM user_achievements
         WHERE user_id = ? AND ruleset_version = ? AND pp_version = ?${validatedVariant ? " AND variant = ?" : ""}`,
        validatedVariant ? [banchoId, CURRENT_RULESET_VERSION, CURRENT_PP_VERSION, validatedVariant] : [banchoId, CURRENT_RULESET_VERSION, CURRENT_PP_VERSION]
    )) as UserAchievement[];
    return result;
}

export async function getUserLatestGamesAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic", limit?: number, offset: number = 0): Promise<Array<Game>> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const validatedVariant = gameVariantSchema.parse(variant);
    const pagination = z
        .object({
            limit: z.number().int().min(1).max(100).optional(),
            offset: z.number().int().min(0).default(0),
        })
        .parse({ limit, offset });

    let query_string = validatedMode
        ? `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND game_mode = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE
           ORDER BY ended_at DESC`
        : `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE
           ORDER BY ended_at DESC`;

    const params = validatedMode ? [banchoId, validatedMode, validatedVariant, CURRENT_RULESET_VERSION] : [banchoId, validatedVariant, CURRENT_RULESET_VERSION];

    if (pagination.limit) {
        query_string += " LIMIT ? OFFSET ?";
        params.push(pagination.limit, pagination.offset);
    }

    return query(query_string, params);
}

export async function getUserGamesCountAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic"): Promise<number> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const validatedVariant = gameVariantSchema.parse(variant);
    const queryString = validatedMode
        ? `SELECT COUNT(*) as total FROM games WHERE user_id = ? AND game_mode = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE`
        : `SELECT COUNT(*) as total FROM games WHERE user_id = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE`;
    const params = validatedMode ? [banchoId, validatedMode, validatedVariant, CURRENT_RULESET_VERSION] : [banchoId, validatedVariant, CURRENT_RULESET_VERSION];
    const [row] = (await query(queryString, params)) as Array<{ total: number }>;

    return row?.total ?? 0;
}

export async function getUserTopGamesAction(banchoId: number, gameMode?: GameMode, variant: GameVariant = "classic", limit: number = 5): Promise<Array<Game>> {
    const validatedMode = gameMode ? gameModeSchema.parse(gameMode) : undefined;
    const validated = z.object({ variant: gameVariantSchema, limit: z.number().int().min(1).max(100) }).parse({ variant, limit });

    const orderBy = validated.variant === "classic" ? "points" : "streak";

    const query_string = validatedMode
        ? `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND game_mode = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE
           ORDER BY ${orderBy} DESC, ended_at ASC
           LIMIT ?`
        : `SELECT user_id, game_mode, points, streak, variant, ended_at
           FROM games
           WHERE user_id = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE
           ORDER BY ${orderBy} DESC, ended_at ASC
           LIMIT ?`;

    const params = validatedMode
        ? [banchoId, validatedMode, validated.variant, CURRENT_RULESET_VERSION, validated.limit]
        : [banchoId, validated.variant, CURRENT_RULESET_VERSION, validated.limit];

    return query(query_string, params);
}

export async function getTopPlayersAction(gamemode: GameMode, variant: GameVariant = "classic", limit: number = 10, orderMetric: "total" | "highest" = "highest", offset: number = 0): Promise<Array<TopPlayer>> {
    const validated = z
        .object({ gamemode: gameModeSchema, variant: gameVariantSchema, limit: z.number().int().min(1).max(100), orderMetric: z.enum(["total", "highest"]), offset: z.number().int().min(0) })
        .parse({ gamemode, variant, limit, orderMetric, offset });
    const orderColumn = validated.variant === "death" ? "highest_streak" : validated.orderMetric === "highest" ? "highest_score" : "total_score";
    const results = await query<Omit<TopPlayer, "badges"> & { badges: string | null }>(
        `WITH game_stats AS (
             SELECT user_id,
                    COUNT(*) AS games_played,
                    MAX(streak) AS highest_streak,
                    ${validated.variant === "death" ? "0" : "MAX(points)"} AS highest_score,
                    ${validated.variant === "death" ? "0" : "SUM(points)"} AS total_score,
                    MIN(ended_at) AS earliest_ended_at
             FROM games
             WHERE game_mode = ? AND variant = ? AND ruleset_version = ? AND ranked = TRUE
             GROUP BY user_id
         ), badge_stats AS (
             SELECT ub.user_id, GROUP_CONCAT(CONCAT(b.name, ':', b.color)) AS badges
             FROM user_badges ub
             JOIN badges b ON ub.badge_name = b.name
             GROUP BY ub.user_id
         )
         SELECT u.*, gs.games_played, gs.highest_streak, gs.highest_score, gs.total_score, gs.earliest_ended_at, bs.badges
         FROM game_stats gs
         JOIN users u ON gs.user_id = u.bancho_id
         LEFT JOIN badge_stats bs ON u.bancho_id = bs.user_id
         ORDER BY gs.${orderColumn} DESC, gs.earliest_ended_at ASC
         LIMIT ? OFFSET ?`,
        [validated.gamemode, validated.variant, CURRENT_RULESET_VERSION, validated.limit, validated.offset],
    );

    return results.map((player) => ({
        ...player,
        badges: player.badges?.split(",").map((badge) => {
            const [name, color] = badge.split(":");
            return { name, color };
        }) ?? [],
    }));
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
         WHERE variant = ? AND ruleset_version = ? AND ranked = TRUE`,
        [variant, variant, CURRENT_RULESET_VERSION]
    )) as [{ total_users: number; total_games: number; highest_score: number }];

    return {
        total_users: Number(result[0].total_users),
        total_games: Number(result[0].total_games),
        highest_points: Number(result[0].highest_score),
    };
}
