import "server-only";

import { auth } from "@/lib/auth/auth";
import { Session } from "next-auth";
import { isLockedForUser } from "@/lib/infra/lockdown";

export type AuthenticatedSession = Session & { user: NonNullable<Session["user"]> };

export async function authenticatedAction<T>(action: (session: AuthenticatedSession) => Promise<T>): Promise<T> {
    return action(await getAuthSession());
}

export async function getAuthSession(): Promise<AuthenticatedSession> {
    const session = await auth();
    if (!session?.user?.banchoId) {
        throw new Error("Unauthorized");
    }

    const locked = await isLockedForUser(session.user.banchoId);
    if (locked) {
        throw new Error("Service is in lockdown");
    }

    return { ...session, user: session.user };
}
