import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";

export async function upsertUser(banchoId: number, username: string, avatarUrl: string): Promise<void> {
    const profile = { username, avatarUrl };
    try {
        await prisma.user.upsert({ where: { banchoId }, update: profile, create: { banchoId, ...profile } });
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        await prisma.user.update({ where: { banchoId }, data: profile });
    }
}
