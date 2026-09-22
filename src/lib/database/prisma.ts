import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "../env";

function buildDatabaseUrl(): string {
    if (env.DATABASE_URL) {
        return env.DATABASE_URL;
    }

    return `mysql://root@${env.DB_HOST}:3306/osu_guessr`;
}

const adapter = new PrismaMariaDb(buildDatabaseUrl());

const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

function hasCurrentSchema(client: PrismaClient | undefined): client is PrismaClient {
    return typeof (client as unknown as { scorePpBatch?: { findMany?: unknown } } | undefined)?.scorePpBatch?.findMany === "function";
}

export const prisma = hasCurrentSchema(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : new PrismaClient({
          adapter,
          log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
      });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
