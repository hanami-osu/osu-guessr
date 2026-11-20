"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addAnnouncement, listAnnouncements, removeAnnouncement } from "@/actions/announcements";
import type { Announcement } from "@/actions/types";
import { AdminGroup, AdminSection, EmptyRow, useAdminAction } from "../ui";

export default function AnnouncementsSection() {
    const { pending, run } = useAdminAction();
    const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");

    const load = useCallback(async () => setAnnouncements((await run(listAnnouncements)) ?? []), [run]);

    useEffect(() => {
        void load();
    }, [load]);

    const publish = async (event: React.FormEvent) => {
        event.preventDefault();
        const result = await run(async () => {
            await addAnnouncement(title, content);
            return true;
        }, "Announcement published");
        if (!result) return;
        setTitle("");
        setContent("");
        await load();
    };

    const remove = async (announcement: Announcement) => {
        if (!confirm(`Delete "${announcement.title}"?`)) return;
        const result = await run(async () => {
            await removeAnnouncement(announcement.id);
            return true;
        }, "Announcement deleted");
        if (result) setAnnouncements((current) => current?.filter(({ id }) => id !== announcement.id) ?? null);
    };

    return (
        <AdminSection title="Announcements" description="Posts shown on the home page and the announcements page.">
            <AdminGroup title="New announcement">
                <form onSubmit={publish} className="max-w-2xl space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="announcement-title">Title</Label>
                        <Input id="announcement-title" placeholder="Service update" value={title} onChange={(event) => setTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="announcement-content">Content</Label>
                        <Textarea id="announcement-content" rows={6} placeholder="What should players know?" value={content} onChange={(event) => setContent(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={pending || !title.trim() || !content.trim()}>
                        Publish
                    </Button>
                </form>
            </AdminGroup>

            <AdminGroup title="Published">
                <ul className="divide-y divide-border/60 border-y border-border/60">
                    {announcements === null ? (
                        <EmptyRow>Loading announcements...</EmptyRow>
                    ) : announcements.length === 0 ? (
                        <EmptyRow>No announcements yet.</EmptyRow>
                    ) : (
                        announcements.map((announcement) => (
                            <li key={announcement.id} className="flex items-start gap-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-3">
                                        <span className="text-sm font-medium">{announcement.title}</span>
                                        <span className="text-xs text-muted-foreground">{new Date(announcement.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{announcement.content}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="size-8 shrink-0 text-destructive hover:text-destructive" onClick={() => remove(announcement)} disabled={pending} aria-label={`Delete ${announcement.title}`}>
                                    <Trash2 />
                                </Button>
                            </li>
                        ))
                    )}
                </ul>
            </AdminGroup>
        </AdminSection>
    );
}
