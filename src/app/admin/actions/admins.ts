"use server";

import { z } from "zod";
import { requireAdmin } from "@/actions/require-admin";
import { OWNER_ID } from "@/lib/users/owner";
import { clearSessionUserAccessCache } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";

const userIdSchema = z.number().int().positive();

export interface AdminUser {
    banchoId: number;
    username: string;
    isOwner: boolean;
}

export async function listAdmins(): Promise<AdminUser[]> {
    await requireAdmin();
    const rows = await prisma.user.findMany({
        where: { OR: [{ isAdmin: true }, { banchoId: OWNER_ID }] },
        select: { banchoId: true, username: true },
        orderBy: { username: "asc" },
    });

    return rows.map((user) => ({
        banchoId: user.banchoId,
        username: user.username,
        isOwner: user.banchoId === OWNER_ID,
    }));
}

export async function setAdmin(rawUserId: number, isAdmin: boolean): Promise<string> {
    await requireAdmin();
    const userId = userIdSchema.parse(rawUserId);

    if (userId === OWNER_ID && !isAdmin) throw new Error("The owner cannot be removed as an admin");

    const user = await prisma.user.findUnique({ where: { banchoId: userId }, select: { username: true, isAdmin: true } });
    if (!user) throw new Error(`User ${userId} not found`);

    if (userId === OWNER_ID || user.isAdmin === isAdmin) {
        return `${user.username} (${userId}) is already ${isAdmin ? "an admin" : "not an admin"}`;
    }

    await prisma.user.updateMany({ where: { banchoId: userId }, data: { isAdmin } });
    clearSessionUserAccessCache();
    return `${isAdmin ? "Granted admin to" : "Removed admin from"} ${user.username} (${userId})`;
}
