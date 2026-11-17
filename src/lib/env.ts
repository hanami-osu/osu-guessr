import { z } from "zod";

const optionalUrl = (message: string) => z.preprocess((value) => (value === "" ? undefined : value), z.string().url(message).optional());

const envSchema = z.object({
    DATABASE_URL: optionalUrl("DATABASE_URL must be a valid database URL"),
    DB_HOST: z.string().optional().default("127.0.0.1"),

    REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
    IS_DOCKER_BUILD: z.string().optional(),

    AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
    HANAMI_ISSUER: z.string().url("HANAMI_ISSUER must be a valid URL"),
    HANAMI_CLIENT_ID: z.string().min(1, "HANAMI_CLIENT_ID is required"),
    HANAMI_INTERNAL_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32, "HANAMI_INTERNAL_SECRET must be at least 32 characters").optional()),
    NEXTAUTH_URL: optionalUrl("NEXTAUTH_URL must be a valid URL"),

    OSU_API_KEY: z.string().min(1, "OSU_API_KEY is required"),
    OSU_CLIENT_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    OSU_CLIENT_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    OSUCK_API_KEY: z.string().optional(),
    OSUCK_API_BASE: z.string().optional(),
    DISCORD_WEBHOOK: optionalUrl("DISCORD_WEBHOOK must be a valid URL"),

    NEXT_PUBLIC_API_URL: z.string().optional(),
    NEXT_PUBLIC_APP_URL: optionalUrl("NEXT_PUBLIC_APP_URL must be a valid URL").default("http://localhost:3000"),
    DEBUG_DAILY_DAY_OFFSET: z.coerce.number().int().default(0),
    DEBUG_DAILY_UNLIMITED_ATTEMPTS: z.string().optional().transform((value) => value === "true"),
    DEBUG_DAILY_REUSE_CHECK: z.string().optional().transform((value) => value === undefined ? true : value === "true"),
});

const processEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_HOST: process.env.DB_HOST,
    REDIS_URL: process.env.REDIS_URL,
    IS_DOCKER_BUILD: process.env.IS_DOCKER_BUILD,
    AUTH_SECRET: process.env.AUTH_SECRET,
    HANAMI_ISSUER: process.env.HANAMI_ISSUER,
    HANAMI_CLIENT_ID: process.env.HANAMI_CLIENT_ID,
    HANAMI_INTERNAL_SECRET: process.env.HANAMI_INTERNAL_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    OSU_API_KEY: process.env.OSU_API_KEY,
    OSU_CLIENT_ID: process.env.OSU_CLIENT_ID,
    OSU_CLIENT_SECRET: process.env.OSU_CLIENT_SECRET,
    OSUCK_API_KEY: process.env.OSUCK_API_KEY,
    OSUCK_API_BASE: process.env.OSUCK_API_BASE,
    DISCORD_WEBHOOK: process.env.DISCORD_WEBHOOK,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    DEBUG_DAILY_DAY_OFFSET: process.env.DEBUG_DAILY_DAY_OFFSET,
    DEBUG_DAILY_UNLIMITED_ATTEMPTS: process.env.DEBUG_DAILY_UNLIMITED_ATTEMPTS,
    DEBUG_DAILY_REUSE_CHECK: process.env.DEBUG_DAILY_REUSE_CHECK,
};

const parsed = envSchema.safeParse(processEnv);

const isDockerBuild = process.env.IS_DOCKER_BUILD === "true";

if (!parsed.success && !isDockerBuild) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
}

export const env: z.infer<typeof envSchema> = parsed.success ? parsed.data : (processEnv as z.infer<typeof envSchema>);
