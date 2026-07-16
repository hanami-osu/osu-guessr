"use server";

import { requireGuessrUser } from "@/actions/server";
import { OWNER_ID } from "@/lib";

export async function requireOwner() {
    const context = await requireGuessrUser();

    if (context.guessrUser.banchoId !== OWNER_ID) {
        throw new Error("Forbidden");
    }

    return context;
}
