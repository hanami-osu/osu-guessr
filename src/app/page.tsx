import { Suspense } from "react";
import Hero from "./components/Hero";
import GameModeCards from "./components/GameModeCards";
import { HomeAnnouncementsSection, HomeStatsSection } from "./HomeContent";
import { getHighestStatsAction } from "@/actions/user-server";
import { readChangelogs } from "@/actions/changelogs";
import { listRecentAnnouncements } from "@/actions/announcements";
import { SupportersSection } from "./components/Supporters";
import { ChangelogsSection } from "./components/Changelogs";

export const dynamic = "force-dynamic";

async function HomeStats() {
    const highStats = await getHighestStatsAction();
    return <HomeStatsSection highStats={highStats} />;
}

async function HomeAnnouncements() {
    const announcements = await listRecentAnnouncements(6);
    return <HomeAnnouncementsSection latestAnnouncement={announcements[0] ?? null} announcementsHistory={announcements} />;
}

async function HomeChangelogs() {
    const changelogs = await readChangelogs();
    if (changelogs.length === 0) return null;

    return (
        <section className="py-12">
            <ChangelogsSection changelogs={changelogs} />
        </section>
    );
}

export default function Home() {
    return (
        <>
            <Hero />
            <GameModeCards />
            <Suspense fallback={null}>
                <HomeStats />
            </Suspense>
            <Suspense fallback={null}>
                <HomeAnnouncements />
            </Suspense>
            <section className="bg-secondary/20 py-12">
                <SupportersSection />
            </section>
            <Suspense fallback={null}>
                <HomeChangelogs />
            </Suspense>
        </>
    );
}
