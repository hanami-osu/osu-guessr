import { prisma } from "./database/prisma";

// Users with a scheduled deletion stay in the database during the grace period but must not appear anywhere public.
export const visibleUserWhere = { deletionScheduledAt: null };

export async function isUserVisible(banchoId: number): Promise<boolean> {
    return (await prisma.user.count({ where: { banchoId, ...visibleUserWhere } })) > 0;
}

export async function getHiddenUserIds(): Promise<number[]> {
    const rows = await prisma.user.findMany({ where: { deletionScheduledAt: { not: null } }, select: { banchoId: true } });
    return rows.map((row) => row.banchoId);
}
