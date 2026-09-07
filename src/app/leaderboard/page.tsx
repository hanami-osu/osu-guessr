import { Metadata } from "next";
import LeaderboardClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Leaderboard",
    description: "Top players and scores by game mode.",
};

export default function LeaderboardPage() {
    return <LeaderboardClient />;
}
