import type { Metadata } from "next";
import MultiplayerBrowser from "./MultiplayerBrowser";
import { listMultiplayerLobbiesAction } from "@/actions/multiplayer-server";
import type { MultiplayerLobbySummary } from "@/lib/multiplayer/multiplayer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Multiplayer",
    description: "Create or join an osu!guessr multiplayer lobby.",
    robots: { index: false, follow: false },
};

export default async function MultiplayerPage() {
    let initialLobbies: MultiplayerLobbySummary[] = [];
    try {
        initialLobbies = await listMultiplayerLobbiesAction();
    } catch {}
    return <MultiplayerBrowser initialLobbies={initialLobbies} />;
}
