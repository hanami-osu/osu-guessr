import "server-only";

import { OWNER_ID } from "@/lib/users/owner";
import { query } from "@/lib/database/index";

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

    const [user] = await query<{ is_admin: number | boolean; deletion_scheduled_at: Date | string | null }>("SELECT is_admin, deletion_scheduled_at FROM users WHERE bancho_id = ? LIMIT 1", [userId]);
    const access = !user || user.deletion_scheduled_at ? { active: false, isAdmin: false } : { active: true, isAdmin: userId === OWNER_ID || Boolean(user.is_admin) };
    accessCache.set(userId, { value: access, expires: Date.now() + ACCESS_CACHE_TTL_MS });
    return access;
}
