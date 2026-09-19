import "server-only";

import { OWNER_ID } from "@/lib";
import { query } from "@/lib/database";

export async function isAdminUserId(userId?: number): Promise<boolean> {
    if (!userId) return false;
    if (userId === OWNER_ID) return true;

    const [user] = await query<{ is_admin: number | boolean }>("SELECT is_admin FROM users WHERE bancho_id = ? LIMIT 1", [userId]);
    return Boolean(user?.is_admin);
}
