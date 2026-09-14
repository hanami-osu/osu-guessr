CREATE TABLE IF NOT EXISTS score_pp_batches (
    id CHAR(36) PRIMARY KEY,
    status VARCHAR(16) NOT NULL,
    target_count INT UNSIGNED NOT NULL DEFAULT 5000,
    pair_count INT UNSIGNED NOT NULL DEFAULT 0,
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    activated_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    INDEX idx_score_pp_batches_status_activated (status, activated_at)
);

CREATE TABLE IF NOT EXISTS score_pp_pairs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_id CHAR(36) NOT NULL,
    source VARCHAR(64) NOT NULL,
    left_score_id VARCHAR(64) NOT NULL,
    right_score_id VARCHAR(64) NOT NULL,
    left_snapshot JSON NOT NULL,
    right_snapshot JSON NOT NULL,
    higher_side VARCHAR(8) NOT NULL,
    pp_gap DECIMAL(12, 3) NOT NULL,
    pp_gap_ratio DECIMAL(8, 6) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY score_pp_batch_source_scores (batch_id, source, left_score_id, right_score_id),
    INDEX idx_score_pp_pairs_batch_ratio (batch_id, pp_gap_ratio)
);
