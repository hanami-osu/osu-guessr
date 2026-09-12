"use client";

import { StatsCard } from "./components/StatsCard";
import { ArrowRight, Gamepad2, Trophy, Users2 } from "lucide-react";
import { useTranslationsContext } from "@/context/translations-provider";
import Link from "next/link";

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
        <section className="pb-10 pt-2">
            <div className="page-container">
                <h2 className="text-2xl font-bold tracking-tight mb-6">{t.home.statistics.title}</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
                    <div>
                        <StatsCard
                            title={t.home.statistics.totalPlayers.title}
                            value={highStats.total_users.toLocaleString(locale)}
                            description={t.home.statistics.totalPlayers.description}
                            icon={<Users2 className="h-6 w-6" />}
                        />
                    </div>
                    <div>
                        <StatsCard
                            title={t.home.statistics.gamesPlayed.title}
                            value={highStats.total_games.toLocaleString(locale)}
                            description={t.home.statistics.gamesPlayed.description}
                            icon={<Gamepad2 className="h-6 w-6" />}
                        />
                    </div>
                    <div>
                        <StatsCard
                            title={t.home.statistics.profilePp.title}
                            value={highStats.highest_run_pp.toLocaleString(locale, { maximumFractionDigits: 1 })}
                            description={t.home.statistics.profilePp.description}
                            icon={<Trophy className="h-6 w-6" />}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

export function HomeAnnouncementsSection({ latestAnnouncement }: Pick<HomeContentProps, "latestAnnouncement">) {
    const { t, locale } = useTranslationsContext();

    if (!latestAnnouncement) return null;

    const preview = latestAnnouncement.content.length > 180 ? `${latestAnnouncement.content.slice(0, 180).trimEnd()}…` : latestAnnouncement.content;

    return (
        <section className="py-10 md:py-12">
            <div className="page-container">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold tracking-tight">{t.home.announcements.title}</h2>
                    <Link href="/announcements" className="subtle-link shrink-0 text-sm text-foreground/65 transition-colors hover:text-primary">
                        {t.home.announcements.viewAll}
                    </Link>
                </div>

                <Link
                    href="/announcements"
                    className="group grid gap-5 border-y border-border py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                    <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="font-medium text-primary">{t.home.announcements.latestLabel}</span>
                            <time className="text-muted-foreground" dateTime={latestAnnouncement.created_at}>
                                {new Date(latestAnnouncement.created_at).toLocaleDateString(locale, { timeZone: "UTC" })}
                            </time>
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-xl">{latestAnnouncement.title}</h3>
                        <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-relaxed text-foreground/65 sm:text-base">{preview}</p>
                    </div>
                    <ArrowRight className="hidden h-5 w-5 text-muted-foreground transition-[color,transform] duration-150 group-hover:translate-x-1 group-hover:text-primary sm:block" aria-hidden="true" />
                </Link>
            </div>
        </section>
    );
}
