import { env } from "@/lib/env";
import { parseHanamiIdentityClaims } from "@/lib/identity/claims";
import { claimGuessrUser } from "@/lib/identity/guessr-user";
import { HANAMI_SESSION_VERSION, isHanamiSessionToken, parseHanamiSessionToken } from "@/lib/identity/session";
import { prisma } from "@/lib/database/prisma";
import NextAuth, { type DefaultSession } from "next-auth";
import OsuProvider from "next-auth/providers/osu";
import { z } from "zod";
import type { InteractiveAuthProvider } from "./auth-provider";
import { buildHanamiProvider } from "./hanami-provider";

export { HANAMI_SESSION_VERSION } from "@/lib/identity/session";

export interface GuessrSessionUser {
    hanamiUserId: string;
    banchoId: number;
    name?: string | null;
    image?: string | null;
}

declare module "next-auth" {
    interface Session {
        user: DefaultSession["user"] & Partial<GuessrSessionUser>;
    }

    interface User {
        hanamiUserId?: string;
        banchoId?: number;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        hanamiUserId?: string;
        banchoId?: number;
        hanamiSessionVersion?: number;
    }
}

const legacyOsuProfileSchema = z.object({
    id: z.coerce.number().int().positive().max(2_147_483_647),
    username: z.string().min(1).max(255),
    avatar_url: z.string().url(),
});

export function getInteractiveAuthProvider(): InteractiveAuthProvider {
    return env.GUESSR_HANAMI_SSO_ENABLED ? "hanami" : "osu";
}

const providers = env.GUESSR_HANAMI_SSO_ENABLED
    ? [
          buildHanamiProvider({
              issuer: env.HANAMI_ISSUER!,
              clientId: env.HANAMI_CLIENT_ID!,
              clientSecret: env.HANAMI_CLIENT_SECRET!,
          }),
      ]
    : [
          OsuProvider({
              clientId: env.OSU_CLIENT_ID!,
              clientSecret: env.OSU_CLIENT_SECRET!,
          }),
      ];

export const { auth, handlers, signIn, signOut } = NextAuth({
    callbacks: {
        signIn: async ({ account, profile }) => {
            if (!env.GUESSR_HANAMI_SSO_ENABLED) {
                return account?.provider === "osu";
            }

            if (account?.provider !== "hanami" || !profile) {
                return false;
            }

            const claims = parseHanamiIdentityClaims(profile);
            await claimGuessrUser(claims);
            return true;
        },
        jwt: async ({ token, account, profile }) => {
            if (!env.GUESSR_HANAMI_SSO_ENABLED) {
                if (account?.provider === "osu" && profile) {
                    const legacyProfile = legacyOsuProfileSchema.parse(profile);
                    token.banchoId = legacyProfile.id;
                    await prisma.user.upsert({
                        where: { banchoId: legacyProfile.id },
                        create: {
                            banchoId: legacyProfile.id,
                            username: legacyProfile.username,
                            avatarUrl: legacyProfile.avatar_url,
                        },
                        update: {
                            username: legacyProfile.username,
                            avatarUrl: legacyProfile.avatar_url,
                        },
                    });
                }
                return token.banchoId ? token : null;
            }

            if (account?.provider === "hanami" && profile) {
                const claims = parseHanamiIdentityClaims(profile);
                token.sub = claims.hanamiUserId;
                token.hanamiUserId = claims.hanamiUserId;
                token.banchoId = claims.banchoId;
                token.hanamiSessionVersion = HANAMI_SESSION_VERSION;
                token.name = claims.name;
                token.picture = claims.image;
            }

            return isHanamiSessionToken(token) ? token : null;
        },
        session: ({ session, token }) => {
            if (!env.GUESSR_HANAMI_SSO_ENABLED) {
                return {
                    ...session,
                    user: {
                        ...session.user,
                        banchoId: token.banchoId,
                    },
                };
            }

            const identity = parseHanamiSessionToken(token);
            return {
                ...session,
                user: {
                    ...session.user,
                    hanamiUserId: identity.hanamiUserId,
                    banchoId: identity.banchoId,
                },
            };
        },
    },
    providers,
    trustHost: true,
});
