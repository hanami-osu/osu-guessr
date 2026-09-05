"use server";

import { requireOwner } from "@/actions/require-owner";
import { transaction } from "@/lib/database";

export async function syncUserAchievements(): Promise<void> {
    await requireOwner();

    await transaction(async (query) => {
        await query("DELETE FROM user_achievements");
        await query(`
            INSERT INTO user_achievements
                (user_id, game_mode, variant, total_score, games_played, highest_streak, highest_score, last_played)
            SELECT
                user_id,
                game_mode,
                variant,
                CASE WHEN variant = 'classic' THEN SUM(points) ELSE 0 END,
                COUNT(*),
                MAX(streak),
                CASE WHEN variant = 'classic' THEN MAX(points) ELSE 0 END,
                MAX(ended_at)
            FROM games
            GROUP BY user_id, game_mode, variant
        `);
    });
}
