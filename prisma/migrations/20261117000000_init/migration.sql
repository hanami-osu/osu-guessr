-- CreateTable
CREATE TABLE `users` (
    `bancho_id` INTEGER NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `avatar_url` TEXT NOT NULL,
    `banner_url` TEXT NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `deletion_scheduled_at` DATETIME(3) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_username`(`username`),
    PRIMARY KEY (`bancho_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badges` (
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(7) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_badges` (
    `user_id` INTEGER NOT NULL,
    `badge_name` VARCHAR(255) NOT NULL,
    `assigned_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`user_id`, `badge_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_keys` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_used` TIMESTAMP(0) NULL,

    INDEX `user_id_idx`(`user_id`),
    INDEX `idx_api_keys_last_used`(`last_used`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_achievements` (
    `user_id` INTEGER NOT NULL,
    `game_mode` ENUM('background', 'audio', 'skin', 'score_pp') NOT NULL,
    `variant` ENUM('classic', 'survival', 'death') NOT NULL DEFAULT 'classic',
    `ruleset_version` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `pp_version` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `total_score` BIGINT NOT NULL DEFAULT 0,
    `games_played` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `rounds_played` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_correct` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_skips` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_timeouts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_response_time_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `highest_streak` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `highest_score` INTEGER NOT NULL DEFAULT 0,
    `best_run_pp` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `profile_pp` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `last_played` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_achievements_mode_pp`(`game_mode`, `variant`, `ruleset_version`, `pp_version`, `profile_pp`),
    INDEX `idx_achievements_global_pp`(`variant`, `ruleset_version`, `pp_version`, `profile_pp`),
    INDEX `idx_user_achievements_score`(`total_score`),
    INDEX `idx_achievements_user_score`(`user_id`, `total_score`),
    INDEX `idx_achievements_mode_variant_score`(`game_mode`, `variant`, `total_score`),
    UNIQUE INDEX `user_game_mode_variant_version`(`user_id`, `game_mode`, `variant`, `ruleset_version`, `pp_version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `games` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `session_id` CHAR(36) NULL,
    `user_id` INTEGER NOT NULL,
    `game_mode` ENUM('background', 'audio', 'skin', 'score_pp') NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `streak` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `variant` ENUM('classic', 'survival', 'death') NOT NULL DEFAULT 'classic',
    `run_type` ENUM('standard', 'daily', 'challenge', 'practice') NOT NULL DEFAULT 'standard',
    `challenge_id` CHAR(36) NULL,
    `seed` VARCHAR(128) NULL,
    `config_snapshot` JSON NULL,
    `ranked` BOOLEAN NOT NULL DEFAULT true,
    `ruleset_version` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `pp_version` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `pp` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `rounds_played` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `correct_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `skip_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `timeout_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `total_response_time_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_reason` ENUM('completed', 'failed', 'quit', 'content_exhausted') NOT NULL DEFAULT 'completed',

    UNIQUE INDEX `unique_game_session`(`session_id`),
    INDEX `idx_games_user_mode`(`user_id`, `game_mode`),
    INDEX `idx_games_ended`(`ended_at`),
    INDEX `idx_games_mode_points`(`game_mode`, `points`),
    INDEX `idx_games_competitive`(`ruleset_version`, `ranked`, `game_mode`, `variant`),
    INDEX `idx_games_user_performance`(`user_id`, `game_mode`, `variant`, `ruleset_version`, `pp_version`, `ranked`, `pp`),
    INDEX `idx_games_challenge`(`challenge_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_rounds` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `game_id` BIGINT UNSIGNED NOT NULL,
    `round_number` INTEGER UNSIGNED NOT NULL,
    `item_type` ENUM('mapset', 'skin', 'score_pair') NOT NULL,
    `item_id` INTEGER UNSIGNED NOT NULL,
    `submitted_guess` VARCHAR(500) NULL,
    `answer_snapshot` VARCHAR(500) NOT NULL,
    `result_type` ENUM('guess', 'skip', 'timeout') NOT NULL,
    `correct` BOOLEAN NOT NULL,
    `response_time_ms` INTEGER UNSIGNED NOT NULL,
    `time_limit_ms` INTEGER UNSIGNED NULL,
    `answered_at` DATETIME(3) NULL,
    `points_earned` INTEGER NOT NULL DEFAULT 0,
    `streak_before` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `streak_after` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `difficulty_snapshot` DECIMAL(8, 4) NULL,
    `content_snapshot` JSON NULL,

    INDEX `idx_game_rounds_item`(`item_type`, `item_id`),
    INDEX `idx_game_rounds_correct_time`(`correct`, `response_time_ms`),
    UNIQUE INDEX `game_round_number`(`game_id`, `round_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_challenges` (
    `id` CHAR(36) NOT NULL,
    `challenge_type` ENUM('daily', 'shared') NOT NULL,
    `creator_user_id` INTEGER NULL,
    `source_game_id` BIGINT UNSIGNED NULL,
    `game_mode` ENUM('background', 'audio', 'skin', 'score_pp') NOT NULL,
    `variant` ENUM('classic', 'survival', 'death') NOT NULL DEFAULT 'classic',
    `ruleset_version` SMALLINT UNSIGNED NOT NULL,
    `pp_version` SMALLINT UNSIGNED NOT NULL,
    `seed` VARCHAR(128) NOT NULL,
    `config_snapshot` JSON NULL,
    `round_count` INTEGER UNSIGNED NULL,
    `timer_ms` INTEGER UNSIGNED NULL,
    `ranked` BOOLEAN NOT NULL DEFAULT true,
    `daily_date` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_game_challenges_creator`(`creator_user_id`),
    INDEX `idx_game_challenges_source_game`(`source_game_id`),
    UNIQUE INDEX `daily_challenge_mode_variant`(`daily_date`, `game_mode`, `variant`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_challenge_rounds` (
    `challenge_id` CHAR(36) NOT NULL,
    `round_number` INTEGER UNSIGNED NOT NULL,
    `item_type` ENUM('mapset', 'skin', 'score_pair') NOT NULL,
    `item_id` INTEGER UNSIGNED NOT NULL,
    `answer_snapshot` VARCHAR(500) NOT NULL,
    `difficulty_snapshot` DECIMAL(8, 4) NULL,
    `content_snapshot` JSON NULL,

    INDEX `idx_game_challenge_rounds_item`(`item_type`, `item_id`),
    PRIMARY KEY (`challenge_id`, `round_number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_game_attempts` (
    `user_id` INTEGER NOT NULL,
    `daily_date` DATE NOT NULL,
    `game_mode` ENUM('background', 'audio', 'skin', 'score_pp') NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `unique_daily_game_session`(`session_id`),
    PRIMARY KEY (`user_id`, `daily_date`, `game_mode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_stats` (
    `game_mode` ENUM('background', 'audio', 'skin', 'score_pp') NOT NULL,
    `item_type` ENUM('mapset', 'skin', 'score_pair') NOT NULL,
    `item_id` INTEGER UNSIGNED NOT NULL,
    `ruleset_version` SMALLINT UNSIGNED NOT NULL,
    `pp_version` SMALLINT UNSIGNED NOT NULL,
    `appearances` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `correct_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `skip_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `timeout_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `total_response_time_ms` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `fastest_correct_ms` INTEGER UNSIGNED NULL,
    `empirical_difficulty` DECIMAL(8, 4) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`game_mode`, `item_type`, `item_id`, `ruleset_version`, `pp_version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_stat_contributions` (
    `user_id` INTEGER NOT NULL,
    `game_mode` ENUM('background', 'audio', 'skin', 'score_pp') NOT NULL,
    `item_type` ENUM('mapset', 'skin', 'score_pair') NOT NULL,
    `item_id` INTEGER UNSIGNED NOT NULL,
    `ruleset_version` SMALLINT UNSIGNED NOT NULL,
    `pp_version` SMALLINT UNSIGNED NOT NULL,
    `correct` BOOLEAN NOT NULL,
    `result_type` ENUM('guess', 'skip', 'timeout') NOT NULL,
    `response_time_ms` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_content_stat_contributions_item`(`game_mode`, `item_type`, `item_id`, `ruleset_version`, `pp_version`),
    PRIMARY KEY (`user_id`, `game_mode`, `item_type`, `item_id`, `ruleset_version`, `pp_version`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mapset_tags` (
    `mapset_id` INTEGER NOT NULL,
    `image_filename` VARCHAR(255) NULL,
    `audio_filename` VARCHAR(255) NULL,

    PRIMARY KEY (`mapset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mapset_data` (
    `mapset_id` INTEGER NOT NULL,
    `title` VARCHAR(500) NULL,
    `artist` VARCHAR(500) NULL,
    `mapper` VARCHAR(500) NULL,
    `ranked_at` DATETIME(3) NULL,
    `star_rating_min` DECIMAL(6, 3) NULL,
    `star_rating_max` DECIMAL(6, 3) NULL,

    INDEX `idx_mapset_data_title`(`title`),
    INDEX `idx_mapset_data_artist`(`artist`),
    INDEX `idx_mapset_data_mapper`(`mapper`),
    INDEX `idx_mapset_data_ranked_at`(`ranked_at`),
    INDEX `idx_mapset_data_star_rating`(`star_rating_min`, `star_rating_max`),
    PRIMARY KEY (`mapset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_pp_batches` (
    `id` CHAR(36) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `target_count` INTEGER UNSIGNED NOT NULL DEFAULT 10000,
    `pair_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `activated_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `idx_score_pp_batches_status_activated`(`status`, `activated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_pp_pairs` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `batch_id` CHAR(36) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `left_score_id` VARCHAR(64) NOT NULL,
    `right_score_id` VARCHAR(64) NOT NULL,
    `left_snapshot` JSON NOT NULL,
    `right_snapshot` JSON NOT NULL,
    `higher_side` VARCHAR(8) NOT NULL,
    `pp_gap` DECIMAL(12, 3) NOT NULL,
    `pp_gap_ratio` DECIMAL(8, 6) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_score_pp_pairs_batch_ratio`(`batch_id`, `pp_gap_ratio`),
    UNIQUE INDEX `score_pp_batch_source_scores`(`batch_id`, `source`, `left_score_id`, `right_score_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skins` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `image_filename` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `mapset_id` INTEGER NOT NULL,
    `report_type` ENUM('incorrect_title', 'inappropriate_content', 'wrong_audio', 'wrong_background', 'other') NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('pending', 'investigating', 'resolved', 'rejected') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `github_issue_number` INTEGER NULL,
    `github_issue_url` VARCHAR(255) NULL,

    INDEX `idx_reports_status`(`status`),
    INDEX `idx_reports_user`(`user_id`),
    INDEX `idx_reports_mapset`(`mapset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

