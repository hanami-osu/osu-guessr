import { env } from "@/lib/env";
import { HanamiProvider, parseHanamiProfile } from "@/lib/hanami-auth";
import { upsertUser } from "@/lib/user-service";
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            banchoId: number;
        } & DefaultSession["user"];
    }
}

export const { auth, handlers } = NextAuth({
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
        session: ({ session, token }) => ({
            ...session,
            user: {
                banchoId: token.banchoId as number,
                name: typeof token.name === "string" ? token.name : null,
                image: typeof token.picture === "string" ? token.picture : null,
            },
        }),
    },
    providers: [
        HanamiProvider({ issuer: env.HANAMI_ISSUER, clientId: env.HANAMI_CLIENT_ID }),
    ],
    trustHost: true,
});
