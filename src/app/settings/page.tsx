import { Metadata } from "next";
import { auth } from "@/lib/auth";
import SignInPrompt from "../games/shared/SignInPrompt";
import SettingsClient from "./SettingsClient";
import { listApiKeysAction } from "@/actions/api-keys-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Settings",
    description: "Manage your osu!guessr API keys.",
    robots: { index: false, follow: false },
};

export default async function SettingsPage() {
    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt />;
    }

    try {
        const apiKeys = await listApiKeysAction();
        return <SettingsClient initialApiKeys={apiKeys} />;
    } catch (error) {
        console.error("Failed to load API keys:", error);
        return <SettingsClient initialApiKeys={[]} initialLoadError />;
    }
}
