-- Recomputes classic pp with per-round item weights (see calculateClassicRunPp).
-- Only ruleset/pp version 1: legacy v2 plays (version 0) have no rounds and no pp, and stay untouched.
-- Old values are kept in classic_pp_backup_20261112 so this can be rolled back:
--   UPDATE games g INNER JOIN classic_pp_backup_20261112 b ON b.game_id = g.id SET g.pp = b.pp;
--   UPDATE user_achievements ua INNER JOIN classic_achievement_pp_backup_20261112 b
--       ON b.user_id = ua.user_id AND b.game_mode = ua.game_mode AND b.ruleset_version = ua.ruleset_version AND b.pp_version = ua.pp_version
--   SET ua.best_run_pp = b.best_run_pp, ua.profile_pp = b.profile_pp WHERE ua.variant = 'classic';

CREATE TABLE IF NOT EXISTS classic_pp_backup_20261112 AS
SELECT id AS game_id, pp
FROM games
WHERE variant = 'classic'
  AND ruleset_version = 1
  AND pp_version = 1;

CREATE TABLE IF NOT EXISTS classic_achievement_pp_backup_20261112 AS
SELECT user_id, game_mode, ruleset_version, pp_version, best_run_pp, profile_pp
FROM user_achievements
WHERE variant = 'classic'
  AND ruleset_version = 1
  AND pp_version = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_classic_pp_round_values;
DROP TEMPORARY TABLE IF EXISTS tmp_classic_pp_backfill;
DROP TEMPORARY TABLE IF EXISTS tmp_classic_pp_ranked_runs;
DROP TEMPORARY TABLE IF EXISTS tmp_classic_pp_achievement_values;

-- Smoothed with 20 prior appearances at 65% accuracy and 10s average response, like the app.
CREATE TEMPORARY TABLE tmp_classic_pp_round_values AS
SELECT
    gr.game_id,
    CASE WHEN gr.correct THEN 1 ELSE 0 END AS is_correct,
    CASE
        WHEN gr.correct THEN
            LEAST(6, GREATEST(0.25, EXP(0.6 * (
                LN(0.65 / 0.35)
                    - LN(
                        ((COALESCE(cs.correct_count, 0) + 13) / (COALESCE(cs.appearances, 0) + 20))
                            / (1 - (COALESCE(cs.correct_count, 0) + 13) / (COALESCE(cs.appearances, 0) + 20))
                    )
            ))))
                * LEAST(1.5, GREATEST(0.75, POWER(
                    ((COALESCE(cs.total_response_time_ms, 0) + 200000) / (COALESCE(cs.appearances, 0) + 20))
                        / GREATEST(500, gr.response_time_ms),
                    0.25
                )))
        ELSE 0
    END AS round_value
FROM game_rounds gr
INNER JOIN games g ON g.id = gr.game_id
LEFT JOIN content_stats cs
    ON cs.game_mode = g.game_mode
   AND cs.item_type = gr.item_type
   AND cs.item_id = gr.item_id
   AND cs.ruleset_version = g.ruleset_version
   AND cs.pp_version = g.pp_version
WHERE g.variant = 'classic'
  AND g.ruleset_version = 1
  AND g.pp_version = 1;

CREATE TEMPORARY TABLE tmp_classic_pp_backfill AS
SELECT
    game_id,
    CASE
        WHEN SUM(is_correct) = 0 THEN 0
        ELSE ROUND(
            100
                * SQRT(COUNT(*) / 10)
                * SUM(round_value) / COUNT(*)
                * POWER(SUM(is_correct) / COUNT(*), 1.4),
            3
        )
    END AS pp
FROM tmp_classic_pp_round_values
GROUP BY game_id;

UPDATE games g
INNER JOIN tmp_classic_pp_backfill b ON b.game_id = g.id
SET g.pp = b.pp;

CREATE TEMPORARY TABLE tmp_classic_pp_ranked_runs AS
SELECT
    g.user_id,
    g.game_mode,
    g.ruleset_version,
    g.pp_version,
    g.pp,
    ROW_NUMBER() OVER (
        PARTITION BY g.user_id, g.game_mode, g.ruleset_version, g.pp_version
        ORDER BY g.pp DESC, g.ended_at ASC, g.id ASC
    ) AS pp_rank
FROM games g
WHERE g.variant = 'classic'
  AND g.ruleset_version = 1
  AND g.pp_version = 1
  AND g.ranked = TRUE
  AND g.pp > 0;

CREATE TEMPORARY TABLE tmp_classic_pp_achievement_values AS
SELECT
    ua.user_id,
    ua.game_mode,
    ua.ruleset_version,
    ua.pp_version,
    COALESCE(MAX(r.pp), 0) AS best_run_pp,
    ROUND(COALESCE(SUM(r.pp * POWER(0.95, r.pp_rank - 1)), 0), 3) AS profile_pp
FROM user_achievements ua
LEFT JOIN tmp_classic_pp_ranked_runs r
    ON r.user_id = ua.user_id
   AND r.game_mode = ua.game_mode
   AND r.ruleset_version = ua.ruleset_version
   AND r.pp_version = ua.pp_version
   AND r.pp_rank <= 100
WHERE ua.variant = 'classic'
  AND ua.ruleset_version = 1
  AND ua.pp_version = 1
GROUP BY ua.user_id, ua.game_mode, ua.ruleset_version, ua.pp_version;

UPDATE user_achievements ua
INNER JOIN tmp_classic_pp_achievement_values p
    ON p.user_id = ua.user_id
   AND p.game_mode = ua.game_mode
   AND p.ruleset_version = ua.ruleset_version
   AND p.pp_version = ua.pp_version
SET ua.best_run_pp = p.best_run_pp,
    ua.profile_pp = p.profile_pp
WHERE ua.variant = 'classic'
  AND ua.ruleset_version = 1
  AND ua.pp_version = 1;

DROP TEMPORARY TABLE tmp_classic_pp_round_values;
DROP TEMPORARY TABLE tmp_classic_pp_backfill;
DROP TEMPORARY TABLE tmp_classic_pp_ranked_runs;
DROP TEMPORARY TABLE tmp_classic_pp_achievement_values;
