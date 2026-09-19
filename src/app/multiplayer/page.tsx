import type { Metadata } from "next";
import MultiplayerBrowser from "./MultiplayerBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Multiplayer",
    description: "Create or join an osu!guessr multiplayer lobby.",
    robots: { index: false, follow: false },
};

export default function MultiplayerPage() {
    return <MultiplayerBrowser />;
}
