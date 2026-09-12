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
            <div className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <header className="bg-muted/35 px-5 py-5 sm:px-7 md:px-9">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Announcements</h1>
                </header>

                <div className="px-5 sm:px-7 md:px-9">
                    {announcements.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">No announcements</div>
                    ) : (
                        <div className="space-y-0">
                            {announcements.map((a) => (
                                <article key={a.id} className="border-t border-border/60 py-5 first:border-t-0 sm:py-6">
                                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-muted/35 px-3 py-2.5">
                                        <h2 className="text-sm font-semibold tracking-tight text-foreground">{a.title}</h2>
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
