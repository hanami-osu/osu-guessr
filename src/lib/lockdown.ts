import redisClient from "./redis";
import { OWNER_ID } from "./index";

const LOCK_KEY = "server:lockdown";

export interface LockInfo {
    until: number; // epoch ms
    ownerId: number;
}

export async function setLock(minutes: number, ownerId: number = OWNER_ID): Promise<LockInfo> {
    const until = Date.now() + Math.max(1, minutes) * 60 * 1000;
    const info: LockInfo = { until, ownerId };
    await redisClient.set(LOCK_KEY, JSON.stringify(info));
    return info;
}

export async function unlock(): Promise<void> {
    await redisClient.del(LOCK_KEY);
}

export async function getLockInfo(): Promise<LockInfo | null> {
    const raw = await redisClient.get(LOCK_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as LockInfo;
        if (!parsed || typeof parsed.until !== "number") return null;
        if (parsed.until <= Date.now()) {
            await redisClient.del(LOCK_KEY);
            return null;
        }
        return parsed;
    } catch {
        await redisClient.del(LOCK_KEY);
        return null;
    }
}

export async function isLockedForUser(banchoId?: number): Promise<boolean> {
    const info = await getLockInfo();
    if (!info) return false;
    if (banchoId && banchoId === info.ownerId) return false;
    return true;
}
