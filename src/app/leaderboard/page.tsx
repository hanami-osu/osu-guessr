import { Metadata } from "next";
import LeaderboardClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Leaderboard",
    description: "View the top players and their scores across different game modes.",
};

export default function LeaderboardPage() {
    return <LeaderboardClient />;
}
