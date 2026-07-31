"use server";

import { auth } from "@/lib/auth";
import { Session } from "next-auth";
import { isLockedForUser } from "@/lib/lockdown";

export async function authenticatedAction<T>(action: (session: Session) => Promise<T>): Promise<T> {
    const session = await auth();
    if (!session?.user?.banchoId) {
        throw new Error("Unauthorized");
    }
    // Check global lockdown state
    const locked = await isLockedForUser(session.user.banchoId);
    if (locked) {
        throw new Error("Service is in lockdown");
    }

    return action(session);
}

export async function getAuthSession(): Promise<Session> {
    const session = await auth();
    if (!session?.user?.banchoId) {
        throw new Error("Unauthorized");
    }

    const locked = await isLockedForUser(session.user.banchoId);
    if (locked) {
        throw new Error("Service is in lockdown");
    }

    return session;
}
