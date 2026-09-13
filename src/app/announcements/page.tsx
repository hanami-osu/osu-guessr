import React from "react";
import { listAnnouncements } from "@/actions/announcements";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Announcements",
    description: "Updates and release notes for osu!guessr.",
};

export default async function AnnouncementsPage() {
    const announcements = await listAnnouncements();

    return (
        <main className="page-container pb-6 pt-3 md:pb-8 md:pt-4">
            <div>
                <header className="flex flex-col gap-3 border-b border-border/60 py-5 sm:flex-row sm:items-end sm:justify-between sm:py-6">
                    <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Announcements</h1>
                        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Updates, release notes, and service news from osu!guessr.</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{announcements.length} {announcements.length === 1 ? "post" : "posts"}</span>
                </header>

                <div className="max-w-3xl">
                    {announcements.length === 0 ? (
                        <div className="border-b border-border/60 py-10 text-sm text-muted-foreground">No announcements</div>
                    ) : (
                        <div>
                            {announcements.map((a, index) => (
                                <article key={a.id} className="border-b border-border/60 py-6 sm:py-7">
                                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                        <div className="flex min-w-0 items-center gap-2">
                                            {index === 0 && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Latest</span>}
                                            <h2 className="text-base font-semibold tracking-tight text-foreground">{a.title}</h2>
                                        </div>
                                        <time className="text-[11px] tabular-nums text-muted-foreground" dateTime={new Date(a.created_at).toISOString()}>
                                            {new Date(a.created_at).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })}
                                        </time>
                                    </div>
                                    <div className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{a.content}</div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
