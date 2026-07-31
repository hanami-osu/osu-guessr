"use server";

import { getAuthSession } from "@/actions/server";
import { OWNER_ID } from "@/lib";

export async function requireOwner() {
    const session = await getAuthSession();

    if (session.user.banchoId !== OWNER_ID) {
        throw new Error("Forbidden");
    }

    return session;
}
