import { env } from "@/lib/env";
import { HanamiProvider, parseHanamiProfile } from "@/lib/hanami-auth";
import { isAdminUserId } from "@/lib/admin";
import { upsertUser } from "@/lib/user-service";
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
        user: {
            banchoId: number;
            isAdmin: boolean;
        } & DefaultSession["user"];
    }
}

export const { auth, handlers } = NextAuth({
    cookies: developmentCookies,
    callbacks: {
        jwt: async ({ token, profile }) => {
            if (profile) {
                const user = parseHanamiProfile(profile);

                await upsertUser(user.banchoId, user.username, user.avatarUrl);

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
            const banchoId = token.banchoId as number;
            return {
                ...session,
                user: {
                    banchoId,
                    isAdmin: await isAdminUserId(banchoId),
                    name: typeof token.name === "string" ? token.name : null,
                    image: typeof token.picture === "string" ? token.picture : null,
                },
            };
        },
    },
    providers: [HanamiProvider({ issuer: env.HANAMI_ISSUER, clientId: env.HANAMI_CLIENT_ID })],
    trustHost: true,
});
