import "server-only";

import { getAuthSession } from "./server";

export async function requireAdmin() {
    const session = await getAuthSession();

    if (!session.user.isAdmin) {
        throw new Error("Forbidden");
    }

    return session;
}
