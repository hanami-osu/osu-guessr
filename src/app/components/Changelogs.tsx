"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import Link from "next/link";
import { SectionLabel } from "@/components/page-heading";
import type { Release } from "@/actions/changelogs";
import { formatReleaseDate, ReleaseNotes } from "@/components/release-notes";

export function ChangelogsSection({ changelogs }: { changelogs: Release[] }) {
    const { t } = useTranslationsContext();

    return (
        <section className="page-container py-6">
            <div className="border-t border-border pt-6">
                <div className="mb-3 flex items-center justify-between gap-4">
                    <SectionLabel>{t.home.updates.title}</SectionLabel>
                    <Link href="/announcements?tab=changelog" className="subtle-link shrink-0 text-sm text-foreground/65 transition-colors hover:text-primary">
                        {t.common.viewMore}
                    </Link>
                </div>

                <div className="max-h-[420px] space-y-5 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                    {changelogs.map((release) => (
                        <div key={release.url} className="border-b border-border/60 pb-5 last:border-0 last:pb-0">
                            <div className="mb-3 flex items-center gap-2">
                                <span className="text-lg font-semibold">{release.version}</span>
                                <span className="text-sm text-foreground/70">• {formatReleaseDate(release.date)}</span>
                            </div>
                            <ReleaseNotes html={release.bodyHtml} />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
