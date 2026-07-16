import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

function getDisposableDatabaseUrl(): string {
    const value = process.env.MIGRATION_TEST_DATABASE_URL;
    if (!value) {
        throw new Error("MIGRATION_TEST_DATABASE_URL is required");
    }

    const url = new URL(value);
    const databaseName = url.pathname.replace(/^\//, "");
    const isLocalHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "mysql:" || !isLocalHost || !databaseName.endsWith("_migration_test")) {
        throw new Error("Migration tests only run against a local database ending in _migration_test");
    }

    return value;
}

async function prepare(prisma: PrismaClient): Promise<void> {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE users (
            bancho_id INT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            avatar_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function verify(prisma: PrismaClient): Promise<void> {
    const columns = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string; IS_NULLABLE: string; CHARACTER_MAXIMUM_LENGTH: bigint | number | null }>>(`
        SELECT COLUMN_NAME, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'hanami_user_id'
    `);
    const indexes = await prisma.$queryRawUnsafe<Array<{ INDEX_NAME: string; NON_UNIQUE: bigint | number }>>(`
        SELECT INDEX_NAME, NON_UNIQUE
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'hanami_user_id'
    `);

    const column = columns[0];
    const uniqueIndex = indexes.find((index) => Number(index.NON_UNIQUE) === 0);
    if (!column || column.IS_NULLABLE !== "YES" || Number(column.CHARACTER_MAXIMUM_LENGTH) !== 255 || !uniqueIndex) {
        throw new Error("hanami_user_id migration verification failed");
    }
}

const mode = process.argv[2];
if (mode !== "prepare" && mode !== "verify") {
    throw new Error("Expected prepare or verify mode");
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getDisposableDatabaseUrl()) });
try {
    if (mode === "prepare") {
        await prepare(prisma);
    } else {
        await verify(prisma);
    }
} finally {
    await prisma.$disconnect();
}
