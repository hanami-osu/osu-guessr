ALTER TABLE users
    ADD COLUMN IF NOT EXISTS supporter_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS supporter_until DATETIME(3) NULL;

-- Hanami supporter status is synced into this badge. Keeps the existing color if the badge already exists.
INSERT IGNORE INTO badges (name, color) VALUES ('Supporter', '#ff69b4');

-- Donors from before Hanami supporter keep their badge (their supporter time is granted on Hanami).
INSERT IGNORE INTO user_badges (user_id, badge_name)
SELECT bancho_id, 'Supporter' FROM users WHERE bancho_id IN (12643934, 4573558, 20973665);
