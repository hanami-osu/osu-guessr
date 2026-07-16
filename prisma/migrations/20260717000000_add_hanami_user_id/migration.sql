-- Add canonical Hanami ownership without changing the existing osu! primary key
-- or any foreign keys that preserve Guessr history.
ALTER TABLE `users`
    ADD COLUMN `hanami_user_id` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `users_hanami_user_id_key`
    ON `users` (`hanami_user_id`);
