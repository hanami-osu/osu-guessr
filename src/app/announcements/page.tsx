import React from "react";
import { listAnnouncements } from "@/actions/announcements";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
    const announcements = await listAnnouncements();

    return (
        <div className="bg-background text-foreground py-10 md:py-16">
            <div className="container mx-auto px-4 max-w-3xl">
                <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">Announcements</h1>
                {announcements.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">No announcements</div>
                ) : (
                    <div className="space-y-5">
                        {announcements.map((a) => (
                            <article key={a.id} className="border-t border-border/60 pt-6">
                                <h2 className="text-xl font-semibold">{a.title}</h2>
                                <time className="block text-sm text-muted-foreground mb-4" dateTime={new Date(a.created_at).toISOString()}>
                                    {new Date(a.created_at).toLocaleString()}
                                </time>
                                <div className="whitespace-pre-wrap leading-relaxed text-foreground/85">{a.content}</div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
