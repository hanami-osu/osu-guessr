import Hero from "./components/Hero";
import GameModeCards from "./components/GameModeCards";
import { HomeAnnouncementsSection, HomeStatsSection } from "./HomeContent";
import { getHighestStatsAction } from "@/actions/user-server";
import { readChangelogs } from "@/actions/changelogs";
import { listRecentAnnouncements } from "@/actions/announcements";
import { SupportersSection } from "./components/Supporters";
import { ChangelogsSection } from "./components/Changelogs";

export const dynamic = "force-dynamic";

export default async function Home() {
    const [classicStats, survivalStats, deathStats, announcements, changelogs] = await Promise.all([
        getHighestStatsAction("classic"),
        getHighestStatsAction("survival"),
        getHighestStatsAction("death"),
        listRecentAnnouncements(1),
        readChangelogs(),
    ]);
    const highStats = {
        total_users: classicStats.total_users,
        total_games: classicStats.total_games + survivalStats.total_games + deathStats.total_games,
        // Death pp is on its own streak-based scale, so it stays out of the cross-variant best.
        highest_run_pp: Math.max(classicStats.highest_run_pp, survivalStats.highest_run_pp),
    };

    return (
        <>
            <Hero />
            <GameModeCards />
            <HomeAnnouncementsSection latestAnnouncement={announcements[0] ?? null} />
            <HomeStatsSection highStats={highStats} />
            <SupportersSection />
            {changelogs.length > 0 && <ChangelogsSection changelogs={changelogs} />}
        </>
    );
}
