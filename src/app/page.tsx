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
    const [highStats, announcements, changelogs] = await Promise.all([getHighestStatsAction(), listRecentAnnouncements(1), readChangelogs()]);

    return (
        <>
            <Hero />
            <GameModeCards />
            <HomeAnnouncementsSection latestAnnouncement={announcements[0] ?? null} />
            <HomeStatsSection highStats={highStats} />
            <section className="bg-secondary/20 py-12">
                <SupportersSection />
            </section>
            {changelogs.length > 0 && (
                <section className="py-12">
                    <ChangelogsSection changelogs={changelogs} />
                </section>
            )}
        </>
    );
}
