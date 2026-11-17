import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import SignInPrompt from "@/app/games/shared/SignInPrompt";

export const metadata: Metadata = {
    title: "Sign in",
    description: "Sign in to osu!guessr with your osu! account.",
    robots: { index: false, follow: false },
};

function readRedirectTarget(value: string | string[] | undefined): string {
    const isLocalPath = typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
    return isLocalPath && !value.startsWith("/signin") ? value : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
    const redirectTo = readRedirectTarget((await searchParams).callbackUrl);
    const session = await auth();

    if (session?.user?.banchoId) redirect(redirectTo);

    return <SignInPrompt redirectTo={redirectTo} required={false} />;
}
