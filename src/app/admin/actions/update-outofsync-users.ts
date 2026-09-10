"use server";

import { requireOwner } from "@/actions/require-owner";
import { transaction } from "@/lib/database";

export async function syncUserAchievements(): Promise<void> {
    await requireOwner();

    await transaction(async (query) => {
        await query("DELETE FROM user_achievements");
        await query(`
            INSERT INTO user_achievements
                (user_id, game_mode, variant, ruleset_version, pp_version, total_score, games_played, rounds_played,
                 total_correct, total_skips, total_timeouts, total_response_time_ms, highest_streak, highest_score,
                 best_run_pp, profile_pp, last_played)
            SELECT
                user_id,
                game_mode,
                variant,
                ruleset_version,
                pp_version,
                CASE WHEN variant = 'classic' THEN SUM(points) ELSE 0 END,
                COUNT(*),
                SUM(rounds_played),
                SUM(correct_count),
                SUM(skip_count),
                SUM(timeout_count),
                SUM(total_response_time_ms),
                MAX(streak),
                CASE WHEN variant = 'classic' THEN MAX(points) ELSE 0 END,
                MAX(pp),
                0,
                MAX(ended_at)
            FROM games
            WHERE ranked = TRUE
            GROUP BY user_id, game_mode, variant, ruleset_version, pp_version
        `);
    });
}
