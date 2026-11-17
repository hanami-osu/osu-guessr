ALTER TABLE daily_game_attempts
    MODIFY COLUMN game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL;