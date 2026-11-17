import { env } from "./env";
import { HanamiProvider, parseHanamiProfile } from "./hanami-auth";
import { getSessionUserAccess } from "./admin";
import { upsertUser } from "./user-service";
import { prisma } from "./database/prisma";
import { applySupporterBadge, parseSupporterBadge } from "./supporter";
import NextAuth, { DefaultSession } from "next-auth";

const developmentCookies =
    process.env.NODE_ENV !== "production"
        ? {
              sessionToken: { name: "osu-guessr.authjs.session-token" },
              callbackUrl: { name: "osu-guessr.authjs.callback-url" },
              csrfToken: { name: "osu-guessr.authjs.csrf-token" },
              pkceCodeVerifier: { name: "osu-guessr.authjs.pkce.code_verifier" },
              state: { name: "osu-guessr.authjs.state" },
              nonce: { name: "osu-guessr.authjs.nonce" },
              webauthnChallenge: { name: "osu-guessr.authjs.challenge" },
          }
        : undefined;

declare module "next-auth" {
    interface Session {
        // Absent when the signed-in user no longer exists or has a deletion scheduled.
        user?: {
            banchoId: number;
            isAdmin: boolean;
        } & NonNullable<DefaultSession["user"]>;
    }
}

export const { auth, handlers } = NextAuth({
    cookies: developmentCookies,
    callbacks: {
        jwt: async ({ token, profile }) => {
            if (profile) {
                const user = parseHanamiProfile(profile);

                await upsertUser(user.banchoId, user.username, user.avatarUrl);
                const badge = parseSupporterBadge(profile);
                if (badge === true) {
                    await applySupporterBadge(prisma, user.banchoId, badge).catch((error: unknown) => {
                        console.error("Failed to store supporter status at sign-in:", error);
                    });
                }

                return {
                    banchoId: user.banchoId,
                    name: user.username,
                    picture: user.avatarUrl,
                };
            }

            const sanitizedToken: { banchoId?: number; name?: string; picture?: string } = {};
            if (typeof token.banchoId === "number") sanitizedToken.banchoId = token.banchoId;
            if (typeof token.name === "string") sanitizedToken.name = token.name;
            if (typeof token.picture === "string") sanitizedToken.picture = token.picture;
            return sanitizedToken;
        },
        session: async ({ session, token }) => {
            const banchoId = typeof token.banchoId === "number" ? token.banchoId : undefined;
            const access = await getSessionUserAccess(banchoId);
            // `user` must be set explicitly: server-side auth() merges the raw token in as `user` when the key is absent.
            if (!banchoId || !access.active) return { expires: session.expires, user: undefined };

            return {
                ...session,
                user: {
                    banchoId,
                    isAdmin: access.isAdmin,
                    name: typeof token.name === "string" ? token.name : null,
                    image: typeof token.picture === "string" ? token.picture : null,
                },
            };
        },
    },
    providers: [HanamiProvider({ issuer: env.HANAMI_ISSUER, clientId: env.HANAMI_CLIENT_ID })],
    trustHost: true,
});
