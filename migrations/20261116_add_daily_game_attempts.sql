CREATE TABLE IF NOT EXISTS daily_game_attempts (
    user_id INT NOT NULL,
    daily_date DATE NOT NULL,
    game_mode ENUM ('background', 'audio', 'skin', 'score_pp') NOT NULL,
    session_id CHAR(36) NOT NULL,
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, daily_date, game_mode),
    UNIQUE KEY unique_daily_game_session (session_id),
    CONSTRAINT fk_daily_game_attempts_user FOREIGN KEY (user_id) REFERENCES users (bancho_id) ON DELETE CASCADE
);