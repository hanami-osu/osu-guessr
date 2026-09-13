ALTER TABLE user_achievements
    MODIFY COLUMN game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL;

ALTER TABLE games
    MODIFY COLUMN game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL;

ALTER TABLE game_challenges
    MODIFY COLUMN game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL;

ALTER TABLE content_stats
    MODIFY COLUMN game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL,
    MODIFY COLUMN item_type ENUM ('mapset', 'skin', 'score_pair') NOT NULL;

ALTER TABLE content_stat_contributions
    MODIFY COLUMN game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL,
    MODIFY COLUMN item_type ENUM ('mapset', 'skin', 'score_pair') NOT NULL;

ALTER TABLE game_rounds
    MODIFY COLUMN item_type ENUM ('mapset', 'skin', 'score_pair') NOT NULL;

ALTER TABLE game_challenge_rounds
    MODIFY COLUMN item_type ENUM ('mapset', 'skin', 'score_pair') NOT NULL;

CREATE TABLE IF NOT EXISTS score_pp_pairs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    left_score_id VARCHAR(64) NOT NULL,
    right_score_id VARCHAR(64) NOT NULL,
    left_snapshot JSON NOT NULL,
    right_snapshot JSON NOT NULL,
    higher_side ENUM ('left', 'right') NOT NULL,
    pp_gap DECIMAL(12, 3) NOT NULL,
    pp_gap_ratio DECIMAL(8, 6) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY score_pp_pair_source_scores (source, left_score_id, right_score_id),
    INDEX idx_score_pp_pairs_active_gap (active, pp_gap),
    INDEX idx_score_pp_pairs_active_ratio (active, pp_gap_ratio)
);
