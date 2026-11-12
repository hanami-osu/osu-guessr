-- When each round was answered, skipped or timed out. Older rounds stay NULL.
ALTER TABLE game_rounds
    ADD COLUMN IF NOT EXISTS answered_at DATETIME(3) NULL AFTER time_limit_ms;
