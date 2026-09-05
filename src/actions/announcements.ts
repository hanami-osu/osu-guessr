"use server";

import { query } from "@/lib/database";
import { Announcement } from "./types";
import { requireOwner } from "@/actions/require-owner";

export async function listAnnouncements(): Promise<Announcement[]> {
    try {
        const results = await query<Announcement>(`
            SELECT id, title, content, created_at
            FROM announcements
            ORDER BY created_at DESC
        `);
        return (results as Announcement[]).map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() } as unknown as Announcement));
    } catch (error) {
        console.error("Error listing announcements:", error);
        return [];
    }
}

export async function listRecentAnnouncements(limit: number = 6): Promise<Announcement[]> {
    try {
        const results = await query<Announcement>(
            `
            SELECT id, title, content, created_at
            FROM announcements
            ORDER BY created_at DESC
            LIMIT ?
        `,
            [limit]
        );
        return (results as Announcement[]).map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() } as unknown as Announcement));
    } catch (error) {
        console.error("Error listing recent announcements:", error);
        return [];
    }
}

export async function addAnnouncement(title: string, content: string): Promise<void> {
    try {
        await requireOwner();
        await query(`INSERT INTO announcements (title, content) VALUES (?, ?);`, [title, content]);
    } catch (error) {
        console.error("Error adding announcement:", error);
        throw error;
    }
}

export async function removeAnnouncement(id: number): Promise<void> {
    try {
        await requireOwner();
        await query(`DELETE FROM announcements WHERE id = ?;`, [id]);
    } catch (error) {
        console.error(`Error removing announcement ${id}:`, error);
        throw error;
    }
}
