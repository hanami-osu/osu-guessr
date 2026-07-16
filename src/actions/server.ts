"use server";

import { auth, type GuessrSessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/database/prisma";
import { resolveGuessrUserByHanamiId } from "@/lib/identity/guessr-user";
import { isLockedForUser } from "@/lib/lockdown";
import type { User } from "@/generated/prisma/client";
import type { Session } from "next-auth";
import { z } from "zod";

const hanamiSessionUserSchema = z.object({
    hanamiUserId: z.string().min(1).max(255),
    banchoId: z.number().int().positive().max(2_147_483_647),
    name: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
});

const legacySessionUserSchema = z.object({
    banchoId: z.number().int().positive().max(2_147_483_647),
});

export type HanamiSession = Session & {
    user: Session["user"] & GuessrSessionUser;
};

export interface GuessrAuthContext {
    session: Session;
    guessrUser: User;
    hanamiUserId: string | null;
}

export async function requireHanamiSession(): Promise<HanamiSession> {
    const session = await auth();
    const parsed = hanamiSessionUserSchema.safeParse(session?.user);
    if (!session || !parsed.success) {
        throw new Error("Unauthorized: an active Hanami session is required");
    }

    return {
        ...session,
        user: {
            ...session.user,
            ...parsed.data,
        },
    } as HanamiSession;
}

export async function requireGuessrUser(): Promise<GuessrAuthContext> {
    if (env.GUESSR_HANAMI_SSO_ENABLED) {
        const session = await requireHanamiSession();
        const guessrUser = await resolveGuessrUserByHanamiId(session.user.hanamiUserId);
        if (!guessrUser || guessrUser.banchoId !== session.user.banchoId) {
            throw new Error("Forbidden: Hanami identity does not own this osu!guessr profile");
        }

        if (await isLockedForUser(guessrUser.banchoId)) {
            throw new Error("Service is in lockdown");
        }

        return {
            session,
            guessrUser,
            hanamiUserId: session.user.hanamiUserId,
        };
    }

    const session = await auth();
    const parsed = legacySessionUserSchema.safeParse(session?.user);
    if (!session || !parsed.success) {
        throw new Error("Unauthorized");
    }

    const guessrUser = await prisma.user.findUnique({ where: { banchoId: parsed.data.banchoId } });
    if (!guessrUser) {
        throw new Error("Unauthorized");
    }

    if (await isLockedForUser(guessrUser.banchoId)) {
        throw new Error("Service is in lockdown");
    }

    return {
        session,
        guessrUser,
        hanamiUserId: null,
    };
}

export async function authenticatedAction<T>(action: (context: GuessrAuthContext) => Promise<T>): Promise<T> {
    return action(await requireGuessrUser());
}
