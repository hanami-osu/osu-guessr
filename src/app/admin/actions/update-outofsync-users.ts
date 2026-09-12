"use server";

import { requireOwner } from "@/actions/require-owner";
import { rebuildUserAchievementCache } from "@/lib/game/achievement-cache";

export async function syncUserAchievements(): Promise<void> {
    await requireOwner();
    await rebuildUserAchievementCache();
}
