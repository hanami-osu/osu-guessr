import { Metadata } from "next";
import LeaderboardClient from "./client";
import { getTopPlayersAction } from "@/actions/user-server";
import { GameMode } from "@/actions/types";
import { createPageMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
    title: "Leaderboard",
    description: "Top players ranked by pp for each game mode.",
    path: "/leaderboard",
});

export default async function LeaderboardPage() {
    try {
        const initialData = await getTopPlayersAction(GameMode.Background, "classic", 10, 0);
        return <LeaderboardClient initialData={initialData} />;
    } catch (error) {
        console.error("Failed to fetch initial leaderboard:", error);
        return <LeaderboardClient initialData={[]} initialError={error instanceof Error ? error.message : "Failed to load leaderboard"} />;
    }
}
