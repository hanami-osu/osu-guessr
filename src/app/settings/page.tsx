import { Metadata } from "next";
import { auth, getInteractiveAuthProvider } from "@/lib/auth";
import { env } from "@/lib/env";
import { getHanamiProfileUrl } from "@/lib/hanami-profile";
import SignInPrompt from "../games/shared/SignInPrompt";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Settings",
    description: "Manage your API keys and account settings",
};

export default async function SettingsPage() {
    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt authProvider={getInteractiveAuthProvider()} />;
    }

    return <SettingsClient hanamiProfileUrl={getHanamiProfileUrl(env.HANAMI_WEB_URL)} />;
}
