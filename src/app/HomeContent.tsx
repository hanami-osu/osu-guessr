"use client";

import { StatsCard } from "./components/StatsCard";
import { Gamepad2, Trophy, Users2 } from "lucide-react";
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
        highest_points: number;
    };
    latestAnnouncement?: { title: string; content: string; created_at: string } | null;
    announcementsHistory?: Array<{ id: number; title: string; content: string; created_at: string }>;
}

export function HomeStatsSection({ highStats }: Pick<HomeContentProps, "highStats">) {
    const { t } = useTranslationsContext();

    return (
        <section className="border-y border-border/40 py-12">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl font-bold mb-6 text-center">{t.home.statistics.title}</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
                    <div className="motion-fade-up">
                        <StatsCard
                            title={t.home.statistics.totalPlayers.title}
                            value={highStats.total_users.toLocaleString()}
                            description={t.home.statistics.totalPlayers.description}
                            icon={<Users2 className="h-6 w-6" />}
                        />
                    </div>
                    <div className="motion-fade-up motion-delay-1">
                        <StatsCard
                            title={t.home.statistics.gamesPlayed.title}
                            value={highStats.total_games.toLocaleString()}
                            description={t.home.statistics.gamesPlayed.description}
                            icon={<Gamepad2 className="h-6 w-6" />}
                        />
                    </div>
                    <div className="motion-fade-up motion-delay-2">
                        <StatsCard
                            title={t.home.statistics.highScore.title}
                            value={highStats.highest_points.toLocaleString()}
                            description={t.home.statistics.highScore.description}
                            icon={<Trophy className="h-6 w-6" />}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

export function HomeAnnouncementsSection({ latestAnnouncement, announcementsHistory }: Pick<HomeContentProps, "latestAnnouncement" | "announcementsHistory">) {
    const { t } = useTranslationsContext();

    if (!latestAnnouncement) return null;

    return (
        <section className="py-12">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl font-bold mb-6 text-center">{t.home.announcements.title}</h2>

                <div className="mx-auto max-w-2xl">
                    <Link href="/announcements" className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                        <div className="border-t border-border/60 py-5">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="soft-loading-dot w-2 h-2 bg-primary rounded-full"></div>
                                <span className="text-sm font-medium text-primary">{t.home.announcements.latestLabel}</span>
                            </div>
                            <h3 className="text-xl font-semibold mb-2">{latestAnnouncement.title}</h3>
                            <div className="text-sm text-muted-foreground mb-3">{new Date(latestAnnouncement.created_at).toLocaleString()}</div>
                            <div className="whitespace-pre-wrap text-foreground">{latestAnnouncement.content}</div>
                        </div>
                        {announcementsHistory && announcementsHistory.length > 1 && (
                            <div className="motion-scale-in mt-4 border-t border-border/50 pt-4">
                                <div className="text-sm text-muted-foreground">
                                    <strong>{t.home.announcements.previous}</strong>
                                    <ul className="mt-2 space-y-1">
                                        {announcementsHistory.slice(1, 6).map((a) => (
                                            <li key={a.id}>
                                                <span className="font-medium">{a.title}</span> <span className="text-xs text-muted-foreground">· {new Date(a.created_at).toLocaleDateString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                        <div className="mt-4 text-center">
                            <span className="text-sm text-primary hover:text-primary/80 underline">{t.home.announcements.viewAll} →</span>
                        </div>
                    </Link>
                </div>
            </div>
        </section>
    );
}
