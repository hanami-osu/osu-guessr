import redisClient from "@/lib/redis";
import { acquireRedisLock, releaseRedisLock, type RedisLock } from "@/lib/redis-lock-core";

const SESSION_KEY_PREFIX = "game_session:";
const SESSION_LOCK_KEY_PREFIX = "game_session_lock:";

const GAME_SESSION_TTL_SECONDS = 3600;
const GAME_SESSION_LOCK_TTL_MS = 30_000;

function sessionKey(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
}

async function readGameSession<T>(sessionId: string): Promise<T | null> {
    const cached = await redisClient.get(sessionKey(sessionId));
    return cached ? (JSON.parse(cached) as T) : null;
}

export async function readOwnedGameSession<T extends { user_id: number }>(sessionId: string, userId: number, notFoundMessage: string, matches?: (session: T) => boolean): Promise<T> {
    const session = await readGameSession<T>(sessionId);
    if (!session || session.user_id !== userId || (matches && !matches(session))) {
        throw new Error(notFoundMessage);
    }
    return session;
}

export async function writeGameSession<T extends { id: string }>(session: T, ttlSeconds: number = GAME_SESSION_TTL_SECONDS): Promise<void> {
    await redisClient.set(sessionKey(session.id), JSON.stringify(session), { EX: ttlSeconds });
}

export async function deleteGameSession(sessionId: string): Promise<void> {
    await redisClient.del(sessionKey(sessionId));
}

export function acquireGameSessionLock(sessionId: string, timeoutMs: number = GAME_SESSION_LOCK_TTL_MS): Promise<RedisLock | null> {
    return acquireRedisLock(`${SESSION_LOCK_KEY_PREFIX}${sessionId}`, timeoutMs);
}

export function releaseGameSessionLock(lock: RedisLock): Promise<void> {
    return releaseRedisLock(lock);
}
