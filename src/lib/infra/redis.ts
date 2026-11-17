import { createClient, RedisClientType } from "redis";
import { env } from "./env";

const globalForRedis = global as unknown as { redis: RedisClientType };

const mockClient = {
    connect: async () => console.log("⚠️ Mock Redis: connect() called during build (Ignored)"),
    on: () => {},
    get: async () => null,
    set: async () => null,
    isOpen: false,
} as unknown as RedisClientType;

const isBuild = process.env.IS_DOCKER_BUILD === "true";

const redisClient = isBuild ? mockClient : globalForRedis.redis || createClient({ url: env.REDIS_URL });

if (!isBuild) {
    redisClient.on("error", (err) => {
        console.error("Redis Client Error", err.message);
    });

    if (!redisClient.isOpen) {
        redisClient.connect().catch(console.error);
    }
}

if (process.env.NODE_ENV !== "production" && !isBuild) {
    globalForRedis.redis = redisClient;
}

export default redisClient;
