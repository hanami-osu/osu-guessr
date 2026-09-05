import fs from "node:fs/promises";
import path from "node:path";
import mariadb, { type Connection } from "mariadb";

const migrationsDirectory = path.join(process.cwd(), "migrations");
const migrationLock = "osu_guessr_schema_migrations";

function databaseConfig() {
    const rawDatabaseUrl = process.env.DATABASE_URL || `mysql://root@${process.env.DB_HOST || "127.0.0.1"}:3306/osu_guessr`;
    const databaseUrl = new URL(rawDatabaseUrl);
    if (!["mysql:", "mariadb:"].includes(databaseUrl.protocol)) throw new Error("DATABASE_URL must use mysql:// or mariadb://");
    if (!databaseUrl.hostname) throw new Error("DATABASE_URL must include a hostname");
    if (!databaseUrl.pathname.slice(1)) throw new Error("DATABASE_URL must include a database name");
    if (databaseUrl.hash) throw new Error("DATABASE_URL must not include a fragment");

    const normalizedUrl = rawDatabaseUrl.replace(/^(mysql|mariadb):/, "mariadb:");
    return `${normalizedUrl}${databaseUrl.search ? "&" : "?"}multipleStatements=true`;
}

async function hasColumnAndUniqueIndex(connection: Connection, table: string, column: string, index: string): Promise<boolean> {
    const rows = await connection.query<Array<{ column_count: bigint; index_column_count: bigint; expected_column_count: bigint }>>(
        `SELECT
             (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?) AS column_count,
             (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? AND non_unique = 0) AS index_column_count,
             (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? AND column_name = ? AND seq_in_index = 1 AND non_unique = 0) AS expected_column_count`,
        [table, column, table, index, table, index, column],
    );
    return Number(rows[0].column_count) === 1 && Number(rows[0].index_column_count) === 1 && Number(rows[0].expected_column_count) === 1;
}

async function hasPrimaryKey(connection: Connection, table: string, column: string): Promise<boolean> {
    const rows = await connection.query<Array<{ primary_key_columns: bigint; expected_column_count: bigint }>>(
        `SELECT
             (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = ? AND index_name = 'PRIMARY') AS primary_key_columns,
             (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = ? AND index_name = 'PRIMARY' AND column_name = ? AND seq_in_index = 1) AS expected_column_count`,
        [table, table, column],
    );
    return Number(rows[0].primary_key_columns) === 1 && Number(rows[0].expected_column_count) === 1;
}

const alreadyApplied: Record<string, (connection: Connection) => Promise<boolean>> = {
    "20260905_add_game_session_id.sql": (connection) => hasColumnAndUniqueIndex(connection, "games", "session_id", "unique_game_session"),
    "20260905_add_mapset_tags_primary_key.sql": (connection) => hasPrimaryKey(connection, "mapset_tags", "mapset_id"),
};

async function validateMigration(connection: Connection, file: string): Promise<void> {
    if (file === "20260905_add_game_session_id.sql") {
        const indexes = await connection.query<Array<{ index_column_count: bigint }>>(
            `SELECT COUNT(*) AS index_column_count
             FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'games' AND index_name = 'unique_game_session'`,
        );
        if (Number(indexes[0].index_column_count) > 0) {
            throw new Error("The unique_game_session index has an unexpected definition; remove it before restarting");
        }
        return;
    }

    if (file !== "20260905_add_mapset_tags_primary_key.sql") return;

    const conflicts = await connection.query<Array<{ mapset_id: number }>>(
        `SELECT mapset_id
         FROM (SELECT DISTINCT mapset_id, image_filename, audio_filename FROM mapset_tags) AS unique_tags
         GROUP BY mapset_id
         HAVING COUNT(*) > 1
         LIMIT 1`,
    );
    if (conflicts[0]) throw new Error(`Conflicting mapset tags for mapset ${conflicts[0].mapset_id}; resolve the duplicate rows before restarting`);
}

async function migrate(): Promise<void> {
    const connection = await mariadb.createConnection(databaseConfig());
    let locked = false;

    try {
        const lockRows = await connection.query<Array<{ acquired: bigint }>>("SELECT GET_LOCK(?, 60) AS acquired", [migrationLock]);
        locked = Number(lockRows[0].acquired) === 1;
        if (!locked) throw new Error("Timed out waiting for the database migration lock");

        await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);

        const files = (await fs.readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
        const appliedRows = await connection.query<Array<{ name: string }>>("SELECT name FROM schema_migrations");
        const applied = new Set(appliedRows.map(({ name }) => name));

        for (const file of files) {
            if (applied.has(file)) continue;

            if (!(await alreadyApplied[file]?.(connection))) {
                await validateMigration(connection, file);
                await connection.query(await fs.readFile(path.join(migrationsDirectory, file), "utf8"));
                console.log(`Applied database migration: ${file}`);
            }

            await connection.query("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [file]);
        }
    } finally {
        if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [migrationLock]).catch(() => {});
        await connection.end();
    }
}

migrate().catch((error) => {
    console.error("Database migration failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
