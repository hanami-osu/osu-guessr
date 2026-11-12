import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAnalytics } from "@/lib/analytics/queries";
import { ANALYTICS_RANGES, parseAnalyticsRange, type AnalyticsRange } from "@/lib/analytics/range";
import { auth } from "@/lib/auth";

import NotFound from "../../not-found";
import { ChallengesSection, ContentSection, MultiplayerSection, OverviewSection, PlayersSection, RoundsSection, RunsSection } from "./sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Analytics",
    robots: { index: false, follow: false },
};

const SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "runs", label: "Runs" },
    { id: "rounds", label: "Rounds" },
    { id: "content", label: "Content" },
    { id: "players", label: "Players" },
    { id: "challenges", label: "Challenges" },
    { id: "multiplayer", label: "Multiplayer" },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
    const session = await auth();
    if (!session?.user?.isAdmin) return <NotFound />;

    const range = parseAnalyticsRange((await searchParams).range);
    const data = await getAnalytics(range);

    return (
        <div className="page-container-wide py-6 md:py-10">
            <header className="flex flex-col gap-5 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="size-4" />
                        Administration
                    </Link>
                    <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Analytics</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        From {data.range.since.toISOString().slice(0, 10)} to now · generated {data.generatedAt.toISOString().slice(11, 16)} UTC
                    </p>
                </div>
                <nav aria-label="Time range" className="flex flex-wrap gap-2">
                    {(Object.keys(ANALYTICS_RANGES) as AnalyticsRange[]).map((key) => (
                        <Button key={key} asChild size="sm" variant={key === range ? "default" : "outline"}>
                            <Link href={`/admin/analytics?range=${key}`} aria-current={key === range ? "page" : undefined}>
                                {ANALYTICS_RANGES[key].label}
                            </Link>
                        </Button>
                    ))}
                </nav>
            </header>

            <nav aria-label="Sections" className="sticky top-16 z-20 -mx-4 mb-2 flex gap-1 overflow-x-auto border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur">
                {SECTIONS.map((section) => (
                    <a key={section.id} href={`#${section.id}`} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                        {section.label}
                    </a>
                ))}
            </nav>

            <div className="space-y-10 pt-4">
                <OverviewSection data={data} />
                <RunsSection data={data} />
                <RoundsSection data={data} />
                <ContentSection data={data} />
                <PlayersSection data={data} />
                <ChallengesSection data={data} />
                <MultiplayerSection data={data} />
            </div>
        </div>
    );
}
