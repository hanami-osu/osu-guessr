"use server";

import { prisma } from "@/lib/database/prisma";
import { Announcement } from "./types";
import { requireAdmin } from "./require-admin";

export async function listAnnouncements(): Promise<Announcement[]> {
    try {
        const results = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
        return results.map(({ createdAt, ...announcement }) => ({ ...announcement, created_at: createdAt.toISOString() }));
    } catch (error) {
        console.error("Error listing announcements:", error);
        return [];
    }
}

export async function listRecentAnnouncements(limit: number = 6): Promise<Announcement[]> {
    try {
        if (limit < 0 || !Number.isSafeInteger(limit)) throw new Error("Invalid announcement limit");
        const results = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: limit });
        return results.map(({ createdAt, ...announcement }) => ({ ...announcement, created_at: createdAt.toISOString() }));
    } catch (error) {
        console.error("Error listing recent announcements:", error);
        return [];
    }
}

export async function addAnnouncement(title: string, content: string): Promise<void> {
    try {
        await requireAdmin();
        await prisma.announcement.create({ data: { title, content } });
    } catch (error) {
        console.error("Error adding announcement:", error);
        throw error;
    }
}

export async function removeAnnouncement(id: number): Promise<void> {
    try {
        await requireAdmin();
        await prisma.announcement.deleteMany({ where: { id } });
    } catch (error) {
        console.error(`Error removing announcement ${id}:`, error);
        throw error;
    }
}
