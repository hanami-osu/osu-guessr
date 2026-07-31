"use server";

import { requireOwner } from "@/actions/require-owner";
import { setLock, unlock, getLockInfo } from "@/lib/lockdown";

export async function adminSetLock(minutes: number) {
    const session = await requireOwner();
    const info = await setLock(minutes, session.user.banchoId);
    return info;
}

export async function adminUnlock() {
    await requireOwner();
    await unlock();
    return { success: true };
}

export async function adminGetLock() {
    await requireOwner();
    return getLockInfo();
}
