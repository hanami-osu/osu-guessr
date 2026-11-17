import "server-only";

import { OWNER_ID } from "../lib";
import { query } from "./database";

export async function getSessionUserAccess(userId?: number): Promise<{ active: boolean; isAdmin: boolean }> {
    if (!userId) return { active: false, isAdmin: false };

    const [user] = await query<{ is_admin: number | boolean; deletion_scheduled_at: Date | string | null }>("SELECT is_admin, deletion_scheduled_at FROM users WHERE bancho_id = ? LIMIT 1", [userId]);
    if (!user || user.deletion_scheduled_at) return { active: false, isAdmin: false };

    return { active: true, isAdmin: userId === OWNER_ID || Boolean(user.is_admin) };
}
