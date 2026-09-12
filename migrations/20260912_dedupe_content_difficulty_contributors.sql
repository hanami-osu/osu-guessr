CREATE TABLE IF NOT EXISTS content_stat_contributions (
    user_id INT NOT NULL,
    game_mode ENUM ('background', 'audio', 'skin') NOT NULL,
    item_type ENUM ('mapset', 'skin') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    ruleset_version SMALLINT UNSIGNED NOT NULL,
    pp_version SMALLINT UNSIGNED NOT NULL,
    correct BOOLEAN NOT NULL,
    result_type ENUM ('guess', 'skip', 'timeout') NOT NULL,
    response_time_ms INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, game_mode, item_type, item_id, ruleset_version, pp_version),
    INDEX idx_content_stat_contributions_item (game_mode, item_type, item_id, ruleset_version, pp_version)
);

DELETE FROM content_stat_contributions;

INSERT INTO content_stat_contributions (
    user_id,
    game_mode,
    item_type,
    item_id,
    ruleset_version,
    pp_version,
    correct,
    result_type,
    response_time_ms,
    created_at
)
SELECT
    first_encounter.user_id,
    first_encounter.game_mode,
    first_encounter.item_type,
    first_encounter.item_id,
    first_encounter.ruleset_version,
    first_encounter.pp_version,
    first_encounter.correct,
    first_encounter.result_type,
    first_encounter.response_time_ms,
    first_encounter.ended_at
FROM (
    SELECT
        g.user_id,
        g.game_mode,
        gr.item_type,
        gr.item_id,
        g.ruleset_version,
        g.pp_version,
        gr.correct,
        gr.result_type,
        gr.response_time_ms,
        g.ended_at,
        ROW_NUMBER() OVER (
            PARTITION BY g.user_id, g.game_mode, gr.item_type, gr.item_id, g.ruleset_version, g.pp_version
            ORDER BY g.started_at, g.id, gr.round_number, gr.id
        ) AS encounter_number
    FROM game_rounds gr
    INNER JOIN games g ON g.id = gr.game_id
    WHERE g.ranked = TRUE
) AS first_encounter
WHERE first_encounter.encounter_number = 1;

DELETE FROM content_stats;

INSERT INTO content_stats (
    game_mode,
    item_type,
    item_id,
    ruleset_version,
    pp_version,
    appearances,
    correct_count,
    skip_count,
    timeout_count,
    total_response_time_ms,
    fastest_correct_ms,
    empirical_difficulty
)
SELECT
    game_mode,
    item_type,
    item_id,
    ruleset_version,
    pp_version,
    COUNT(*),
    SUM(correct),
    SUM(result_type = 'skip'),
    SUM(result_type = 'timeout'),
    SUM(response_time_ms),
    MIN(CASE WHEN correct THEN response_time_ms ELSE NULL END),
    NULL
FROM content_stat_contributions
GROUP BY game_mode, item_type, item_id, ruleset_version, pp_version;

UPDATE content_stats
SET empirical_difficulty = ROUND(
    LEAST(
        1.5,
        GREATEST(
            0.75,
            1
                + 0.8 * (0.65 - ((correct_count + 13) / (appearances + 20)))
                + 0.4 * (
                    LEAST(
                        1,
                        GREATEST(
                            0,
                            ((total_response_time_ms + 200000) / (appearances + 20)) / 30000
                        )
                    )
                    - (10000 / 30000)
                )
        )
    ),
    3
);
