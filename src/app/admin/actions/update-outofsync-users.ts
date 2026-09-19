"use server";

import { requireAdmin } from "@/actions/require-admin";
import { rebuildUserAchievementCache } from "@/lib/game/achievement-cache";

export async function syncUserAchievements(): Promise<void> {
    await requireAdmin();
    await rebuildUserAchievementCache();
}
