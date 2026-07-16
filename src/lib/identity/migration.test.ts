import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

describe("Hanami ownership migration", () => {
    test("is additive and leaves Guessr history tables untouched", () => {
        const migration = readFileSync(path.join(process.cwd(), "prisma/migrations/20260717000000_add_hanami_user_id/migration.sql"), "utf8");
        expect(migration).toContain("ADD COLUMN `hanami_user_id`");
        expect(migration).toContain("CREATE UNIQUE INDEX `users_hanami_user_id_key`");
        expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
        expect(migration).not.toMatch(/\b(games|user_achievements|api_keys|reports|user_badges)\b/i);
    });
});
