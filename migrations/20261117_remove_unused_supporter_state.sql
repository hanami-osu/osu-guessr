ALTER TABLE users
    DROP COLUMN IF EXISTS supporter_active,
    DROP COLUMN IF EXISTS supporter_until;
