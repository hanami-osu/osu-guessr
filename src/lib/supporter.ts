import type { PrismaClient } from "@/generated/prisma/client";

export const SUPPORTER_BADGE = "Supporter";
const supporterBadgeClaim = "https://hanami.yorunoken.com/claims/supporter_badge";

export function parseSupporterBadge(profile: Record<string, unknown>): boolean | null {
    const badge = profile[supporterBadgeClaim];
    return typeof badge === "boolean" ? badge : null;
}

/** Anyone who has supported keeps the badge. */
export async function applySupporterBadge(database: Pick<PrismaClient, "user" | "userBadge">, banchoId: number, badge: boolean): Promise<void> {
    if (!badge || !(await database.user.findUnique({ where: { banchoId }, select: { banchoId: true } }))) return;
    await database.userBadge.upsert({
        where: { userId_badgeName: { userId: banchoId, badgeName: SUPPORTER_BADGE } },
        update: {},
        create: { userId: banchoId, badgeName: SUPPORTER_BADGE },
    });
}
