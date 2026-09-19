"use server";

import { z } from "zod";
import { requireAdmin } from "@/actions/require-admin";
import { OWNER_ID } from "@/lib";
import { query } from "@/lib/database";

const userIdSchema = z.number().int().positive();

export interface AdminUser {
    banchoId: number;
    username: string;
    isOwner: boolean;
}

export async function listAdmins(): Promise<AdminUser[]> {
    await requireAdmin();
    const rows = await query<{ bancho_id: number; username: string }>(
        "SELECT bancho_id, username FROM users WHERE is_admin = TRUE OR bancho_id = ? ORDER BY username",
        [OWNER_ID],
    );

    return rows.map((user) => ({
        banchoId: user.bancho_id,
        username: user.username,
        isOwner: user.bancho_id === OWNER_ID,
    }));
}

export async function setAdmin(rawUserId: number, isAdmin: boolean): Promise<string> {
    await requireAdmin();
    const userId = userIdSchema.parse(rawUserId);

    if (userId === OWNER_ID && !isAdmin) throw new Error("The owner cannot be removed as an admin");

    const [user] = await query<{ username: string; is_admin: number | boolean }>(
        "SELECT username, is_admin FROM users WHERE bancho_id = ? LIMIT 1",
        [userId],
    );
    if (!user) throw new Error(`User ${userId} not found`);

    if (userId === OWNER_ID || Boolean(user.is_admin) === isAdmin) {
        return `${user.username} (${userId}) is already ${isAdmin ? "an admin" : "not an admin"}`;
    }

    await query("UPDATE users SET is_admin = ? WHERE bancho_id = ?", [isAdmin, userId]);
    return `${isAdmin ? "Granted admin to" : "Removed admin from"} ${user.username} (${userId})`;
}
