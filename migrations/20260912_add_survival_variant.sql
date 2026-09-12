ALTER TABLE user_achievements
    MODIFY variant ENUM ('classic', 'survival', 'death') NOT NULL DEFAULT 'classic';

ALTER TABLE games
    MODIFY variant ENUM ('classic', 'survival', 'death') NOT NULL DEFAULT 'classic';

ALTER TABLE game_challenges
    MODIFY variant ENUM ('classic', 'survival', 'death') NOT NULL DEFAULT 'classic';
