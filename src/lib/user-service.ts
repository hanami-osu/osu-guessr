import "server-only";

import { query } from "@/lib/database";

export async function upsertUser(banchoId: number, username: string, avatarUrl: string): Promise<void> {
    await query(
        `INSERT INTO users (bancho_id, username, avatar_url)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            avatar_url = VALUES(avatar_url)`,
        [banchoId, username, avatarUrl],
    );
}
