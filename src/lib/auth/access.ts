import "server-only";

import { OWNER_ID } from "@/lib/users/owner";
import { prisma } from "@/lib/database/prisma";

// Access checks run on every authenticated request, so results are cached briefly.
// Admin and deletion changes propagate within the TTL window.
const ACCESS_CACHE_TTL_MS = 30_000;
const accessCache = new Map<number, { value: { active: boolean; isAdmin: boolean }; expires: number }>();

export function clearSessionUserAccessCache(): void {
    accessCache.clear();
}

export async function getSessionUserAccess(userId?: number): Promise<{ active: boolean; isAdmin: boolean }> {
    if (!userId) return { active: false, isAdmin: false };

    const cached = accessCache.get(userId);
    if (cached && cached.expires > Date.now()) return cached.value;

    const user = await prisma.user.findUnique({ where: { banchoId: userId }, select: { isAdmin: true, deletionScheduledAt: true } });
    const access = !user || user.deletionScheduledAt ? { active: false, isAdmin: false } : { active: true, isAdmin: userId === OWNER_ID || user.isAdmin };
    accessCache.set(userId, { value: access, expires: Date.now() + ACCESS_CACHE_TTL_MS });
    return access;
}
