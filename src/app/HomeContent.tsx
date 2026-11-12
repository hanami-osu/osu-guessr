"use client";

import { StatsCard } from "./components/StatsCard";
import { ArrowRight } from "lucide-react";
import { useTranslationsContext } from "@/context/translations-provider";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChangelogEntry {
    description: string;
    commit?: string;
    pr?: string;
}

export interface Changelog {
    version: string;
    date: string;
    changes: Array<ChangelogEntry>;
}

interface HomeContentProps {
    highStats: {
        total_users: number;
        total_games: number;
        highest_run_pp: number;
    };
    latestAnnouncement?: { title: string; content: string; created_at: string } | null;
}

export function HomeStatsSection({ highStats }: Pick<HomeContentProps, "highStats">) {
    const { t, locale } = useTranslationsContext();

    return (
        <section className="pb-6 pt-2">
            <div className="page-container">
                <h2 className="font-display mb-4 text-lg font-semibold tracking-tight">{t.home.statistics.title}</h2>
                <Card className="grid grid-cols-1 divide-y divide-border/60 md:grid-cols-3 md:divide-x md:divide-y-0">
                    <StatsCard title={t.home.statistics.totalPlayers.title} value={highStats.total_users.toLocaleString(locale)} description={t.home.statistics.totalPlayers.description} />
                    <StatsCard title={t.home.statistics.gamesPlayed.title} value={highStats.total_games.toLocaleString(locale)} description={t.home.statistics.gamesPlayed.description} />
                    <StatsCard
                        title={t.home.statistics.profilePp.title}
                        value={highStats.highest_run_pp.toLocaleString(locale, { maximumFractionDigits: 1 })}
                        description={t.home.statistics.profilePp.description}
                    />
                </Card>
            </div>
        </section>
    );
}

export function HomeAnnouncementsSection({ latestAnnouncement }: Pick<HomeContentProps, "latestAnnouncement">) {
    const { t, locale } = useTranslationsContext();

    if (!latestAnnouncement) return null;

    const preview = latestAnnouncement.content.length > 180 ? `${latestAnnouncement.content.slice(0, 180).trimEnd()}…` : latestAnnouncement.content;

    return (
        <section className="py-6">
            <div className="page-container">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 className="font-display text-lg font-semibold tracking-tight">{t.home.announcements.title}</h2>
                    <Link href="/announcements" className="subtle-link shrink-0 text-sm text-foreground/65 transition-colors hover:text-primary">
                        {t.home.announcements.viewAll}
                    </Link>
                </div>

                <Link
                    href="/announcements"
                    className={cn(
                        "group grid gap-5 rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5",
                    )}
                >
                    <div className="min-w-0">
                        <time className="mb-2 block text-sm text-muted-foreground" dateTime={latestAnnouncement.created_at}>
                            {new Date(latestAnnouncement.created_at).toLocaleDateString(locale, { timeZone: "UTC" })}
                        </time>
                        <h3 className="text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">{latestAnnouncement.title}</h3>
                        <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{preview}</p>
                    </div>
                    <ArrowRight className="hidden h-5 w-5 text-muted-foreground transition-colors duration-150 group-hover:text-primary sm:block" aria-hidden="true" />
                </Link>
            </div>
        </section>
    );
}
