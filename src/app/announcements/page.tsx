import { listAnnouncements } from "@/actions/announcements";
import { readChangelogs } from "@/actions/changelogs";
import type { Metadata } from "next";
import Link from "next/link";
import { formatReleaseDate, ReleaseNotes } from "@/components/release-notes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Announcements & changelog",
    description: "Announcements and release history for osu!guessr.",
};

function announcementSlug(title: string, id: number) {
    const slug = title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${slug || "announcement"}-${id}`;
}

function releaseSlug(version: string) {
    return `release-${version.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

const TABS = ["announcements", "changelog"] as const;
type Tab = (typeof TABS)[number];

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
    const { tab: tabParam } = await searchParams;
    const tab: Tab = tabParam === "changelog" ? "changelog" : "announcements";
    const [announcements, releases] = await Promise.all([listAnnouncements(), readChangelogs()]);
    const counts: Record<Tab, number> = { announcements: announcements.length, changelog: releases.length };
    const labels: Record<Tab, string> = { announcements: "Announcements", changelog: "Changelog" };

    return (
        <div className="page-container pb-12 pt-3 md:pb-16 md:pt-4">
            <header className="py-5 sm:py-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Announcements &amp; changelog</h1>
                <nav className="mt-5 flex flex-wrap gap-1.5 border-b border-border" aria-label="Updates sections">
                    {TABS.map((item) => (
                        <Link
                            key={item}
                            href={item === "announcements" ? "/announcements" : `/announcements?tab=${item}`}
                            aria-current={tab === item ? "page" : undefined}
                            className={`-mb-px border-b-2 px-2 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"}`}
                        >
                            {labels[item]} <span className="text-muted-foreground">({counts[item]})</span>
                        </Link>
                    ))}
                </nav>
            </header>

            {tab === "announcements" && (
                <section id="announcements" aria-label="Announcements">
                    {announcements.length === 0 ? (
                        <div className="rounded-lg bg-card/60 px-4 py-10 text-sm text-muted-foreground sm:px-6">No announcements yet.</div>
                    ) : (
                        <div className="space-y-4">
                            {announcements.map((announcement, index) => {
                                const slug = announcementSlug(announcement.title, announcement.id);
                                return (
                                    <article id={slug} key={announcement.id} className="scroll-mt-24 rounded-lg bg-card/60 px-4 py-6 sm:px-6 sm:py-7">
                                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                            <div className="flex min-w-0 items-center gap-2">
                                                {index === 0 && <span className="shrink-0 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">Latest</span>}
                                                <h3 className="text-base font-semibold tracking-tight text-foreground">
                                                    <a href={`#${slug}`} className="underline decoration-border underline-offset-4 hover:decoration-primary">
                                                        {announcement.title}
                                                    </a>
                                                </h3>
                                            </div>
                                            <time className="text-xs tabular-nums text-muted-foreground" dateTime={new Date(announcement.created_at).toISOString()}>
                                                {new Date(announcement.created_at).toLocaleDateString("en", {
                                                    dateStyle: "medium",
                                                    timeZone: "UTC",
                                                })}
                                            </time>
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{announcement.content}</div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {tab === "changelog" && (
                <section id="changelog" aria-label="Changelog">
                    {releases.length === 0 ? (
                        <div className="rounded-lg bg-card/60 px-4 py-10 text-sm text-muted-foreground sm:px-6">No release notes available.</div>
                    ) : (
                        <div className="space-y-4">
                            {releases.map((release, index) => {
                                const slug = releaseSlug(release.version);
                                return (
                                    <article id={slug} key={release.url} className="scroll-mt-24 rounded-lg bg-card/60 px-4 py-5 sm:px-6">
                                        <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
                                                <a href={`#${slug}`} className="underline decoration-border underline-offset-4 hover:decoration-primary">
                                                    {release.version}
                                                </a>
                                            </h3>
                                            {index === 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-primary">Latest</span>}
                                            <time className="text-xs tabular-nums text-muted-foreground" dateTime={release.date}>
                                                {formatReleaseDate(release.date)}
                                            </time>
                                            <a className="ml-auto text-xs text-primary hover:underline" href={release.url} target="_blank" rel="noopener noreferrer">
                                                View on GitHub
                                            </a>
                                        </header>
                                        <ReleaseNotes html={release.bodyHtml} />
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
