SET
    FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS user_badges;
DROP TABLE IF EXISTS badges;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS game_challenge_rounds;
DROP TABLE IF EXISTS content_stats;
DROP TABLE IF EXISTS game_challenges;
DROP TABLE IF EXISTS game_rounds;
DROP TABLE IF EXISTS user_achievements;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS mapset_tags_before_20260905;
DROP TABLE IF EXISTS mapset_tags;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS mapset_data;
DROP TABLE IF EXISTS skins;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
    bancho_id INT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    avatar_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS badges (
    name VARCHAR(255) PRIMARY KEY,
    color VARCHAR(7) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_badges (
    user_id INT NOT NULL,
    badge_name VARCHAR(255) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_name),
    FOREIGN KEY (user_id) REFERENCES users (bancho_id) ON DELETE CASCADE,
    FOREIGN KEY (badge_name) REFERENCES badges (name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (bancho_id) ON DELETE CASCADE,
    INDEX user_id_idx (user_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INT NOT NULL,
    game_mode ENUM ('background', 'audio', 'skin') NOT NULL,
    variant ENUM ('classic', 'death') DEFAULT 'classic',
    ruleset_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pp_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    total_score BIGINT DEFAULT 0,
    games_played INT UNSIGNED DEFAULT 0,
    rounds_played INT UNSIGNED DEFAULT 0,
    total_correct INT UNSIGNED DEFAULT 0,
    total_skips INT UNSIGNED DEFAULT 0,
    total_timeouts INT UNSIGNED DEFAULT 0,
    total_response_time_ms BIGINT UNSIGNED DEFAULT 0,
    highest_streak INT UNSIGNED DEFAULT 0,
    highest_score INT DEFAULT 0,
    best_run_pp DECIMAL(12, 3) NOT NULL DEFAULT 0,
    profile_pp DECIMAL(12, 3) NOT NULL DEFAULT 0,
    last_played DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY user_game_mode_variant_version (user_id, game_mode, variant, ruleset_version, pp_version),
    INDEX idx_achievements_mode_pp (game_mode, variant, ruleset_version, pp_version, profile_pp),
    INDEX idx_achievements_global_pp (variant, ruleset_version, pp_version, profile_pp),
    FOREIGN KEY (user_id) REFERENCES users (bancho_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id CHAR(36),
    user_id INT NOT NULL,
    game_mode ENUM ('background', 'audio', 'skin') NOT NULL,
    points INT DEFAULT 0,
    streak INT UNSIGNED DEFAULT 0,
    variant ENUM ('classic', 'death') DEFAULT 'classic',
    run_type ENUM ('standard', 'daily', 'challenge', 'practice') NOT NULL DEFAULT 'standard',
    challenge_id CHAR(36),
    seed VARCHAR(128),
    config_snapshot JSON,
    ranked BOOLEAN NOT NULL DEFAULT TRUE,
    ruleset_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pp_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pp DECIMAL(12, 3) NOT NULL DEFAULT 0,
    rounds_played INT UNSIGNED NOT NULL DEFAULT 0,
    correct_count INT UNSIGNED NOT NULL DEFAULT 0,
    skip_count INT UNSIGNED NOT NULL DEFAULT 0,
    timeout_count INT UNSIGNED NOT NULL DEFAULT 0,
    total_response_time_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ended_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    end_reason ENUM ('completed', 'failed', 'quit', 'content_exhausted') NOT NULL DEFAULT 'completed',
    UNIQUE KEY unique_game_session (session_id),
    INDEX idx_games_user_performance (user_id, game_mode, variant, ruleset_version, pp_version, ranked, pp),
    FOREIGN KEY (user_id) REFERENCES users (bancho_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    game_id BIGINT UNSIGNED NOT NULL,
    round_number INT UNSIGNED NOT NULL,
    item_type ENUM ('mapset', 'skin') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    submitted_guess VARCHAR(500),
    answer_snapshot VARCHAR(500) NOT NULL,
    result_type ENUM ('guess', 'skip', 'timeout') NOT NULL,
    correct BOOLEAN NOT NULL,
    response_time_ms INT UNSIGNED NOT NULL,
    time_limit_ms INT UNSIGNED,
    points_earned INT NOT NULL DEFAULT 0,
    streak_before INT UNSIGNED NOT NULL DEFAULT 0,
    streak_after INT UNSIGNED NOT NULL DEFAULT 0,
    difficulty_snapshot DECIMAL(8, 4),
    content_snapshot JSON,
    UNIQUE KEY game_round_number (game_id, round_number),
    INDEX idx_game_rounds_item (item_type, item_id),
    INDEX idx_game_rounds_correct_time (correct, response_time_ms),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_challenges (
    id CHAR(36) NOT NULL PRIMARY KEY,
    challenge_type ENUM ('daily', 'shared') NOT NULL,
    creator_user_id INT,
    source_game_id BIGINT UNSIGNED,
    game_mode ENUM ('background', 'audio', 'skin') NOT NULL,
    variant ENUM ('classic', 'death') NOT NULL DEFAULT 'classic',
    ruleset_version SMALLINT UNSIGNED NOT NULL,
    pp_version SMALLINT UNSIGNED NOT NULL,
    seed VARCHAR(128) NOT NULL,
    config_snapshot JSON,
    round_count INT UNSIGNED,
    timer_ms INT UNSIGNED,
    ranked BOOLEAN NOT NULL DEFAULT TRUE,
    daily_date DATE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY daily_challenge_mode_variant (daily_date, game_mode, variant),
    INDEX idx_game_challenges_creator (creator_user_id),
    INDEX idx_game_challenges_source_game (source_game_id),
    FOREIGN KEY (creator_user_id) REFERENCES users (bancho_id) ON DELETE SET NULL,
    FOREIGN KEY (source_game_id) REFERENCES games (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_challenge_rounds (
    challenge_id CHAR(36) NOT NULL,
    round_number INT UNSIGNED NOT NULL,
    item_type ENUM ('mapset', 'skin') NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    answer_snapshot VARCHAR(500) NOT NULL,
    difficulty_snapshot DECIMAL(8, 4),
    content_snapshot JSON,
    PRIMARY KEY (challenge_id, round_number),
    INDEX idx_game_challenge_rounds_item (item_type, item_id),
    FOREIGN KEY (challenge_id) REFERENCES game_challenges (id) ON DELETE CASCADE
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
    fastest_correct_ms INT UNSIGNED,
    empirical_difficulty DECIMAL(8, 4),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (game_mode, item_type, item_id, ruleset_version, pp_version)
);

CREATE TABLE IF NOT EXISTS mapset_tags (
    mapset_id INT PRIMARY KEY,
    image_filename VARCHAR(255),
    audio_filename VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS mapset_data (
    mapset_id INT PRIMARY KEY,
    title VARCHAR(500),
    artist VARCHAR(500),
    mapper VARCHAR(500),
    ranked_at DATETIME(3),
    star_rating_min DECIMAL(6, 3),
    star_rating_max DECIMAL(6, 3)
);

CREATE TABLE IF NOT EXISTS skins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    image_filename VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    mapset_id INT NOT NULL,
    report_type ENUM (
        'incorrect_title',
        'inappropriate_content',
        'wrong_audio',
        'wrong_background',
        'other'
    ) NOT NULL,
    description TEXT,
    status ENUM (
        'pending',
        'investigating',
        'resolved',
        'rejected'
    ) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    github_issue_number INT,
    github_issue_url VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users (bancho_id) ON DELETE CASCADE,
    FOREIGN KEY (mapset_id) REFERENCES mapset_data (mapset_id) ON DELETE CASCADE,
    INDEX idx_reports_status (status),
    INDEX idx_reports_user (user_id),
    INDEX idx_reports_mapset (mapset_id)
);

CREATE TABLE IF NOT EXISTS announcements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_username ON users (username);

CREATE INDEX IF NOT EXISTS idx_games_user_mode ON games (user_id, game_mode);

CREATE INDEX IF NOT EXISTS idx_games_ended ON games (ended_at);

CREATE INDEX IF NOT EXISTS idx_mapset_data_title ON mapset_data (title);

CREATE INDEX IF NOT EXISTS idx_mapset_data_artist ON mapset_data (artist);

CREATE INDEX IF NOT EXISTS idx_mapset_data_mapper ON mapset_data (mapper);

CREATE INDEX IF NOT EXISTS idx_mapset_data_ranked_at ON mapset_data (ranked_at);

CREATE INDEX IF NOT EXISTS idx_mapset_data_star_rating ON mapset_data (star_rating_min, star_rating_max);

CREATE INDEX IF NOT EXISTS idx_user_achievements_score ON user_achievements (total_score);

CREATE INDEX IF NOT EXISTS idx_api_keys_last_used ON api_keys (last_used);

CREATE INDEX IF NOT EXISTS idx_achievements_user_score ON user_achievements (user_id, total_score);

CREATE INDEX IF NOT EXISTS idx_achievements_mode_variant_score ON user_achievements (game_mode, variant, total_score);

CREATE INDEX IF NOT EXISTS idx_games_mode_points ON games (game_mode, points);

CREATE INDEX IF NOT EXISTS idx_games_competitive ON games (ruleset_version, ranked, game_mode, variant);

CREATE INDEX IF NOT EXISTS idx_games_challenge ON games (challenge_id);

SET
    FOREIGN_KEY_CHECKS = 1;
