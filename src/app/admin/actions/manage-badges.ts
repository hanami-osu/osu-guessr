"use server";

import { query } from "@/lib/database";
import { requireOwner } from "@/actions/require-owner";
import { z } from "zod";

export interface UserBadge {
    user_id: number;
    username: string;
    badge_name: string;
    color: string;
    assigned_at: string;
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
    await requireOwner();
    return query("SELECT * FROM badges ORDER BY name");
}

export async function addBadge(name: string, color: string) {
    try {
        await requireOwner();
        const validated = badgeSchema.parse({ name, color });
        const formattedName = capitalizeWords(validated.name);

        await query("INSERT INTO badges (name, color) VALUES (?, ?)", [formattedName, validated.color]);

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
        await requireOwner();
        const formattedName = capitalizeWords(name);
        await query("DELETE FROM badges WHERE name = ?", [formattedName]);
        return `Removed badge "${formattedName}"`;
    } catch (error) {
        throw new Error(`Failed to remove badge: ${error}`);
    }
}

export async function assignBadgeToUser(userId: number, badgeName: string) {
    try {
        await requireOwner();
        const formattedName = capitalizeWords(badgeName);
        await query("INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)", [userId, formattedName]);
        return `Assigned badge "${formattedName}" to user ${userId}`;
    } catch (error) {
        throw new Error(`Failed to assign badge: ${error}`);
    }
}

export async function removeBadgeFromUser(userId: number, badgeName: string) {
    try {
        await requireOwner();
        const formattedName = capitalizeWords(badgeName);
        await query("DELETE FROM user_badges WHERE user_id = ? AND badge_name = ?", [userId, formattedName]);
        return `Removed badge "${formattedName}" from user ${userId}`;
    } catch (error) {
        throw new Error(`Failed to remove badge: ${error}`);
    }
}

export async function listBadges(): Promise<UserBadge[]> {
    try {
        await requireOwner();
        const results = await query(`
            SELECT ub.user_id, u.username, b.name as badge_name, b.color, ub.assigned_at
            FROM user_badges ub
            JOIN users u ON ub.user_id = u.bancho_id
            JOIN badges b ON ub.badge_name = b.name
            ORDER BY ub.assigned_at DESC
        `);
        return results as UserBadge[];
    } catch (error) {
        throw new Error(`Failed to list badges: ${error}`);
    }
}
