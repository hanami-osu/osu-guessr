"use server";

import { requireAdmin } from "@/actions/require-admin";
import { setLock, unlock, getLockInfo } from "@/lib/lockdown";

export async function adminSetLock(minutes: number) {
    const session = await requireAdmin();
    const info = await setLock(minutes, session.user.banchoId);
    return info;
}

export async function adminUnlock() {
    await requireAdmin();
    await unlock();
    return { success: true };
}

export async function adminGetLock() {
    await requireAdmin();
    return getLockInfo();
}
