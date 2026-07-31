import { createUserAction } from "@/actions/user-server";
import { env } from "@/lib/env";
import NextAuth, { DefaultSession } from "next-auth";
import OsuProvider from "next-auth/providers/osu";

declare module "next-auth" {
    interface Session {
        user: {
            banchoId: number;
        } & DefaultSession["user"];
    }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
    callbacks: {
        jwt: async ({ token, profile }) => {
            if (profile) {
                token.banchoId = profile.id;

                await createUserAction(token.banchoId as number, profile.username as string, profile.avatar_url as string);
            }
            return token;
        },
        session: ({ session, token }) => ({
            ...session,
            user: {
                ...session.user,
                banchoId: token.banchoId,
            },
        }),
    },
    providers: [
        OsuProvider({
            clientId: env.OSU_CLIENT_ID,
            clientSecret: env.OSU_CLIENT_SECRET,
        }),
    ],
    trustHost: true,
});
