DROP TEMPORARY TABLE IF EXISTS tmp_survival_pp_round_values;
DROP TEMPORARY TABLE IF EXISTS tmp_survival_pp_running;
DROP TEMPORARY TABLE IF EXISTS tmp_survival_pp_prefix_scores;
DROP TEMPORARY TABLE IF EXISTS tmp_survival_pp_backfill;
DROP TEMPORARY TABLE IF EXISTS tmp_survival_pp_ranked_runs;
DROP TEMPORARY TABLE IF EXISTS tmp_survival_pp_achievement_values;

CREATE TEMPORARY TABLE tmp_survival_pp_round_values AS
SELECT
    gr.game_id,
    gr.round_number,
    CASE WHEN gr.correct THEN 1 ELSE 0 END AS is_correct,
    LEAST(
        1,
        GREATEST(
            0,
            gr.response_time_ms * 1e0 / GREATEST(1, COALESCE(gr.time_limit_ms, 30000))
        )
    ) AS response_ratio,
    LEAST(1.5, GREATEST(0.75, COALESCE(gr.difficulty_snapshot, 1))) AS difficulty_factor
FROM game_rounds gr
INNER JOIN games g ON g.id = gr.game_id
WHERE g.variant = 'survival'
  AND g.ruleset_version = 1
  AND g.pp_version = 1;

CREATE TEMPORARY TABLE tmp_survival_pp_running AS
SELECT
    game_id,
    round_number,
    SUM(is_correct) OVER running_prefix AS correct_count,
    SUM(CASE WHEN is_correct = 1 THEN 1 - POWER(response_ratio, 0.65) ELSE 0 END) OVER running_prefix AS speed_sum,
    SUM(CASE WHEN is_correct = 1 THEN response_ratio ELSE 0 END) OVER running_prefix AS response_ratio_sum,
    SUM(CASE WHEN is_correct = 1 THEN response_ratio * response_ratio ELSE 0 END) OVER running_prefix AS response_ratio_squares_sum,
    SUM(CASE WHEN is_correct = 1 THEN difficulty_factor ELSE 0 END) OVER running_prefix AS difficulty_sum
FROM tmp_survival_pp_round_values
WINDOW running_prefix AS (
    PARTITION BY game_id
    ORDER BY round_number
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
);

CREATE TEMPORARY TABLE tmp_survival_pp_prefix_scores AS
SELECT
    game_id,
    ROUND(
        100
            * POWER(correct_count * 1e0 / (correct_count + 3), 2.4)
            * (0.75 + 0.5 * speed_sum * 1e0 / correct_count)
            * (
                0.9
                    + 0.1
                        * CASE
                            WHEN correct_count < 2 THEN 0.5
                            ELSE 1 - LEAST(
                                1,
                                SQRT(
                                    GREATEST(
                                        0,
                                        response_ratio_squares_sum * 1e0 / correct_count
                                            - POWER(response_ratio_sum * 1e0 / correct_count, 2)
                                    )
                                ) / 0.35
                            )
                        END
            )
            * difficulty_sum * 1e0 / correct_count
            * SQRT(correct_count * 1e0 / 10),
        3
    ) AS pp
FROM tmp_survival_pp_running
WHERE correct_count > 0;

CREATE TEMPORARY TABLE tmp_survival_pp_backfill AS
SELECT
    g.id AS game_id,
    COALESCE(MAX(p.pp), 0) AS pp
FROM games g
LEFT JOIN tmp_survival_pp_prefix_scores p ON p.game_id = g.id
WHERE g.variant = 'survival'
  AND g.ruleset_version = 1
  AND g.pp_version = 1
GROUP BY g.id;

UPDATE games g
INNER JOIN tmp_survival_pp_backfill b ON b.game_id = g.id
SET g.pp = b.pp;

CREATE TEMPORARY TABLE tmp_survival_pp_ranked_runs AS
SELECT
    g.user_id,
    g.game_mode,
    g.variant,
    g.ruleset_version,
    g.pp_version,
    g.id AS game_id,
    g.pp,
    ROW_NUMBER() OVER (
        PARTITION BY g.user_id, g.game_mode, g.variant, g.ruleset_version, g.pp_version
        ORDER BY g.pp DESC, g.ended_at ASC, g.id ASC
    ) AS pp_rank
FROM games g
WHERE g.variant = 'survival'
  AND g.ruleset_version = 1
  AND g.pp_version = 1
  AND g.ranked = TRUE
  AND g.pp > 0;

CREATE TEMPORARY TABLE tmp_survival_pp_achievement_values AS
SELECT
    ua.user_id,
    ua.game_mode,
    COALESCE(MAX(r.pp), 0) AS best_run_pp,
    ROUND(COALESCE(SUM(r.pp * POWER(0.95, r.pp_rank - 1)), 0), 3) AS profile_pp
FROM user_achievements ua
LEFT JOIN tmp_survival_pp_ranked_runs r
    ON r.user_id = ua.user_id
   AND r.game_mode = ua.game_mode
   AND r.variant = ua.variant
   AND r.ruleset_version = ua.ruleset_version
   AND r.pp_version = ua.pp_version
   AND r.pp_rank <= 100
WHERE ua.variant = 'survival'
  AND ua.ruleset_version = 1
  AND ua.pp_version = 1
GROUP BY ua.user_id, ua.game_mode;

UPDATE user_achievements ua
INNER JOIN tmp_survival_pp_achievement_values p
    ON p.user_id = ua.user_id
   AND p.game_mode = ua.game_mode
SET ua.best_run_pp = p.best_run_pp,
    ua.profile_pp = p.profile_pp
WHERE ua.variant = 'survival'
  AND ua.ruleset_version = 1
  AND ua.pp_version = 1;

DROP TEMPORARY TABLE tmp_survival_pp_round_values;
DROP TEMPORARY TABLE tmp_survival_pp_running;
DROP TEMPORARY TABLE tmp_survival_pp_prefix_scores;
DROP TEMPORARY TABLE tmp_survival_pp_backfill;
DROP TEMPORARY TABLE tmp_survival_pp_ranked_runs;
DROP TEMPORARY TABLE tmp_survival_pp_achievement_values;
