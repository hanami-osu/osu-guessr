ALTER TABLE games
    ADD COLUMN IF NOT EXISTS id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
    ADD COLUMN IF NOT EXISTS run_type ENUM ('standard', 'daily', 'challenge', 'practice') NOT NULL DEFAULT 'standard' AFTER variant,
    ADD COLUMN IF NOT EXISTS challenge_id CHAR(36) NULL AFTER run_type,
    ADD COLUMN IF NOT EXISTS seed VARCHAR(128) NULL AFTER challenge_id,
    ADD COLUMN IF NOT EXISTS config_snapshot JSON NULL AFTER seed,
    ADD COLUMN IF NOT EXISTS ranked BOOLEAN NOT NULL DEFAULT TRUE AFTER config_snapshot,
    ADD COLUMN IF NOT EXISTS ruleset_version SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER ranked,
    ADD COLUMN IF NOT EXISTS pp_version SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER ruleset_version,
    ADD COLUMN IF NOT EXISTS pp DECIMAL(12, 3) NOT NULL DEFAULT 0 AFTER pp_version,
    ADD COLUMN IF NOT EXISTS rounds_played INT UNSIGNED NOT NULL DEFAULT 0 AFTER pp,
    ADD COLUMN IF NOT EXISTS correct_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rounds_played,
    ADD COLUMN IF NOT EXISTS skip_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER correct_count,
    ADD COLUMN IF NOT EXISTS timeout_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER skip_count,
    ADD COLUMN IF NOT EXISTS total_response_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER timeout_count,
    ADD COLUMN IF NOT EXISTS started_at DATETIME(3) NULL AFTER total_response_time_ms,
    ADD COLUMN IF NOT EXISTS end_reason ENUM ('completed', 'failed', 'quit', 'content_exhausted') NOT NULL DEFAULT 'completed' AFTER ended_at;

UPDATE games SET started_at = ended_at WHERE started_at IS NULL;

ALTER TABLE games
    MODIFY COLUMN started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY COLUMN ended_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS idx_games_competitive ON games (ruleset_version, ranked, game_mode, variant);
CREATE INDEX IF NOT EXISTS idx_games_challenge ON games (challenge_id);

ALTER TABLE user_achievements
    ADD COLUMN IF NOT EXISTS ruleset_version SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER variant,
    ADD COLUMN IF NOT EXISTS pp_version SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER ruleset_version,
    ADD COLUMN IF NOT EXISTS rounds_played INT UNSIGNED NOT NULL DEFAULT 0 AFTER games_played,
    ADD COLUMN IF NOT EXISTS total_correct INT UNSIGNED NOT NULL DEFAULT 0 AFTER rounds_played,
    ADD COLUMN IF NOT EXISTS total_skips INT UNSIGNED NOT NULL DEFAULT 0 AFTER total_correct,
    ADD COLUMN IF NOT EXISTS total_timeouts INT UNSIGNED NOT NULL DEFAULT 0 AFTER total_skips,
    ADD COLUMN IF NOT EXISTS total_response_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER total_timeouts,
    ADD COLUMN IF NOT EXISTS best_run_pp DECIMAL(12, 3) NOT NULL DEFAULT 0 AFTER highest_score,
    ADD COLUMN IF NOT EXISTS profile_pp DECIMAL(12, 3) NOT NULL DEFAULT 0 AFTER best_run_pp;

DROP INDEX IF EXISTS user_game_mode_variant ON user_achievements;
CREATE UNIQUE INDEX IF NOT EXISTS user_game_mode_variant_version
    ON user_achievements (user_id, game_mode, variant, ruleset_version, pp_version);

ALTER TABLE user_achievements
    MODIFY COLUMN last_played DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE mapset_data
    ADD COLUMN IF NOT EXISTS ranked_at DATETIME(3) NULL AFTER mapper,
    ADD COLUMN IF NOT EXISTS star_rating_min DECIMAL(6, 3) NULL AFTER ranked_at,
    ADD COLUMN IF NOT EXISTS star_rating_max DECIMAL(6, 3) NULL AFTER star_rating_min;

CREATE INDEX IF NOT EXISTS idx_mapset_data_ranked_at ON mapset_data (ranked_at);
CREATE INDEX IF NOT EXISTS idx_mapset_data_star_rating ON mapset_data (star_rating_min, star_rating_max);

CREATE TABLE IF NOT EXISTS game_rounds (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    game_id BIGINT UNSIGNED NOT NULL,
    round_number INT UNSIGNED NOT NULL,
    item_type ENUM ('mapset', 'skin') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    submitted_guess VARCHAR(500) NULL,
    answer_snapshot VARCHAR(500) NOT NULL,
    result_type ENUM ('guess', 'skip', 'timeout') NOT NULL,
    correct BOOLEAN NOT NULL,
    response_time_ms INT UNSIGNED NOT NULL,
    time_limit_ms INT UNSIGNED NULL,
    points_earned INT NOT NULL DEFAULT 0,
    streak_before INT UNSIGNED NOT NULL DEFAULT 0,
    streak_after INT UNSIGNED NOT NULL DEFAULT 0,
    difficulty_snapshot DECIMAL(8, 4) NULL,
    content_snapshot JSON NULL,
    UNIQUE KEY game_round_number (game_id, round_number),
    INDEX idx_game_rounds_item (item_type, item_id),
    INDEX idx_game_rounds_correct_time (correct, response_time_ms),
    CONSTRAINT fk_game_rounds_game FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_challenges (
    id CHAR(36) NOT NULL PRIMARY KEY,
    challenge_type ENUM ('daily', 'shared') NOT NULL,
    creator_user_id INT NULL,
    source_game_id BIGINT UNSIGNED NULL,
    game_mode ENUM ('background', 'audio', 'skin') NOT NULL,
    variant ENUM ('classic', 'death') NOT NULL DEFAULT 'classic',
    ruleset_version SMALLINT UNSIGNED NOT NULL,
    pp_version SMALLINT UNSIGNED NOT NULL,
    seed VARCHAR(128) NOT NULL,
    config_snapshot JSON NULL,
    round_count INT UNSIGNED NULL,
    timer_ms INT UNSIGNED NULL,
    ranked BOOLEAN NOT NULL DEFAULT TRUE,
    daily_date DATE NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY daily_challenge_mode_variant (daily_date, game_mode, variant),
    INDEX idx_game_challenges_creator (creator_user_id),
    INDEX idx_game_challenges_source_game (source_game_id),
    CONSTRAINT fk_game_challenges_creator FOREIGN KEY (creator_user_id) REFERENCES users (bancho_id) ON DELETE SET NULL,
    CONSTRAINT fk_game_challenges_source_game FOREIGN KEY (source_game_id) REFERENCES games (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_challenge_rounds (
    challenge_id CHAR(36) NOT NULL,
    round_number INT UNSIGNED NOT NULL,
    item_type ENUM ('mapset', 'skin') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    answer_snapshot VARCHAR(500) NOT NULL,
    difficulty_snapshot DECIMAL(8, 4) NULL,
    content_snapshot JSON NULL,
    PRIMARY KEY (challenge_id, round_number),
    INDEX idx_game_challenge_rounds_item (item_type, item_id),
    CONSTRAINT fk_game_challenge_rounds_challenge FOREIGN KEY (challenge_id) REFERENCES game_challenges (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_stats (
    game_mode ENUM ('background', 'audio', 'skin') NOT NULL,
    item_type ENUM ('mapset', 'skin') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    ruleset_version SMALLINT UNSIGNED NOT NULL,
    pp_version SMALLINT UNSIGNED NOT NULL,
    appearances BIGINT UNSIGNED NOT NULL DEFAULT 0,
    correct_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    skip_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    timeout_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    total_response_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    fastest_correct_ms INT UNSIGNED NULL,
    empirical_difficulty DECIMAL(8, 4) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (game_mode, item_type, item_id, ruleset_version, pp_version)
);
