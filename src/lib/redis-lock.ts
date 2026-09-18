import "server-only";

import crypto from "node:crypto";
import redisClient from "./redis";

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
`;

export interface RedisLock {
    key: string;
    token: string;
}

export async function acquireRedisLock(key: string, ttlMs: number): Promise<RedisLock | null> {
    const token = crypto.randomUUID();
    const result = await redisClient.set(key, token, {
        condition: "NX",
        expiration: { type: "PX", value: ttlMs },
    });

    return result === "OK" ? { key, token } : null;
}

export async function releaseRedisLock(lock: RedisLock): Promise<void> {
    await redisClient.eval(RELEASE_LOCK_SCRIPT, {
        keys: [lock.key],
        arguments: [lock.token],
    });
}
