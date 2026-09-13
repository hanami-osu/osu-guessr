ALTER TABLE score_pp_pairs
    ADD COLUMN IF NOT EXISTS pp_gap_ratio DECIMAL(8, 6) NOT NULL DEFAULT 0 AFTER pp_gap;

CREATE INDEX IF NOT EXISTS idx_score_pp_pairs_active_ratio
    ON score_pp_pairs (active, pp_gap_ratio);
