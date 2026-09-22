import { Metadata } from "next";
import LeaderboardClient from "./client";
import { getTopPlayersAction } from "@/actions/user-server";
import { GameMode } from "@/actions/types";
import { createPageMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
    title: "Leaderboard",
    description: "Top players ranked by pp for each game mode and variant.",
    path: "/leaderboard",
});

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; variant?: string | string[] }> }) {
    const { mode, variant } = await searchParams;
    const initialMode = typeof mode === "string" && Object.values(GameMode).includes(mode as GameMode) ? mode as GameMode : GameMode.Background;
    const initialVariant = variant === "survival" ? "survival" : "classic";

    try {
        const initialData = await getTopPlayersAction(initialMode, initialVariant, 10, 0);
        return <LeaderboardClient initialData={initialData} initialMode={initialMode} initialVariant={initialVariant} />;
    } catch (error) {
        console.error("Failed to fetch initial leaderboard:", error);
        return <LeaderboardClient initialData={[]} initialMode={initialMode} initialVariant={initialVariant} initialError={error instanceof Error ? error.message : "Failed to load leaderboard"} />;
    }
}
