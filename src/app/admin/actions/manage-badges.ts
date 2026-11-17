"use server";

import { prisma } from "@/lib/database/prisma";
import { requireAdmin } from "@/actions/require-admin";
import { z } from "zod";

export interface UserBadge {
    user_id: number;
    username: string;
    badge_name: string;
    color: string;
    assigned_at: Date;
}

const badgeSchema = z.object({
    name: z.string().min(1),
    color: z.string().regex(/^#[0-9A-F]{6}$/i, "Must be a valid hex color"),
});

function capitalizeWords(str: string): string {
    return str
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

export async function getBadges() {
    await requireAdmin();
    const badges = await prisma.badge.findMany({ orderBy: { name: "asc" } });
    return badges.map(({ createdAt, ...badge }) => ({ ...badge, created_at: createdAt }));
}

export async function addBadge(name: string, color: string) {
    try {
        await requireAdmin();
        const validated = badgeSchema.parse({ name, color });
        const formattedName = capitalizeWords(validated.name);

        await prisma.badge.create({ data: { name: formattedName, color: validated.color } });

        return `Added badge "${formattedName}" with color ${validated.color}`;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(`Validation error: ${error.errors.map((e) => e.message).join(", ")}`);
        }
        throw new Error(`Failed to add badge: ${error}`);
    }
}

export async function removeBadge(name: string) {
    try {
        await requireAdmin();
        const formattedName = capitalizeWords(name);
        await prisma.badge.deleteMany({ where: { name: formattedName } });
        return `Removed badge "${formattedName}"`;
    } catch (error) {
        throw new Error(`Failed to remove badge: ${error}`);
    }
}

export async function assignBadgeToUser(userId: number, badgeName: string) {
    try {
        await requireAdmin();
        const formattedName = capitalizeWords(badgeName);
        await prisma.userBadge.create({ data: { userId, badgeName: formattedName } });
        return `Assigned badge "${formattedName}" to user ${userId}`;
    } catch (error) {
        throw new Error(`Failed to assign badge: ${error}`);
    }
}

export async function removeBadgeFromUser(userId: number, badgeName: string) {
    try {
        await requireAdmin();
        const formattedName = capitalizeWords(badgeName);
        await prisma.userBadge.deleteMany({ where: { userId, badgeName: formattedName } });
        return `Removed badge "${formattedName}" from user ${userId}`;
    } catch (error) {
        throw new Error(`Failed to remove badge: ${error}`);
    }
}

export async function listBadges(): Promise<UserBadge[]> {
    try {
        await requireAdmin();
        const badges = await prisma.badge.findMany({ select: { name: true, color: true } });
        const assignments = await Promise.all(badges.map(async (badge) => ({
            badge,
            users: await prisma.userBadge.findMany({ where: { badgeName: badge.name }, select: { userId: true, assignedAt: true } }),
        })));
        const userIds = [...new Set(assignments.flatMap(({ users }) => users.map(({ userId }) => userId)))];
        const users = await prisma.user.findMany({ where: { banchoId: { in: userIds } }, select: { banchoId: true, username: true } });
        const usernames = new Map(users.map(({ banchoId, username }) => [banchoId, username]));
        const results = assignments.flatMap(({ badge, users }) => users.flatMap(({ userId, assignedAt }) => {
            const username = usernames.get(userId);
            return username === undefined ? [] : [{ user_id: userId, username, badge_name: badge.name, color: badge.color, assigned_at: assignedAt }];
        }));
        return results.sort((a, b) => b.assigned_at.getTime() - a.assigned_at.getTime());
    } catch (error) {
        throw new Error(`Failed to list badges: ${error}`);
    }
}
