import "server-only";

import { normalizeDatabaseValue } from "./normalize";
import { prisma } from "./prisma";

type QueryExecutor = {
    $queryRawUnsafe<T>(query: string, ...values: Array<unknown>): Promise<T>;
    $executeRawUnsafe(query: string, ...values: Array<unknown>): Promise<number>;
};

export type Query = <T = unknown>(sql: string, values?: Array<unknown>) => Promise<T[]>;

function isReadQuery(sql: string): boolean {
    const operation = sql.trimStart().split(/\s+/, 1)[0]?.toUpperCase();
    return operation ? ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"].includes(operation) : false;
}

async function executeQuery<T>(executor: QueryExecutor, sql: string, values: Array<unknown> = []): Promise<T[]> {
    const parameters = values.map((value) => value ?? null);

    try {
        if (isReadQuery(sql)) {
            return normalizeDatabaseValue(await executor.$queryRawUnsafe<T[]>(sql, ...parameters)) as T[];
        }

        await executor.$executeRawUnsafe(sql, ...parameters);
        return [];
    } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        throw new Error(`Query failed: ${cause.message}`, { cause });
    }
}

export const query: Query = (sql, values) => executeQuery(prisma, sql, values);

export function transaction<T>(operation: (query: Query) => Promise<T>): Promise<T> {
    return prisma.$transaction((client) => operation((sql, values) => executeQuery(client, sql, values)));
}
