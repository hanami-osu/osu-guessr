"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { Changelog } from "../HomeContent";

interface ChangelogsProps {
    changelogs: Array<Changelog>;
}

export function ChangelogsSection({ changelogs }: ChangelogsProps) {
    const { t } = useTranslationsContext();
    const sortedChangelogs = [...changelogs].reverse();

    return (
        <div className="container mx-auto px-4">
            <div className="rounded-lg border border-border/60 bg-card p-4 sm:p-5">
                <h2 className="mb-5 text-center text-2xl font-bold">{t.home.updates.title}</h2>

                <div className="max-h-[420px] space-y-5 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                    {sortedChangelogs.map((log, i) => (
                        <div key={i} className="border-b border-border/50 pb-5 last:border-0 last:pb-0">
                            <div className="mb-3 flex items-center gap-2">
                                <span className="text-lg font-semibold">{log.version}</span>
                                <span className="text-sm text-foreground/70">• {log.date}</span>
                            </div>

                            <ul className="space-y-2">
                                {log.changes.map((change, j) => (
                                    <li key={j} className="text-foreground/80 flex items-start gap-2">
                                        <span className="text-primary">•</span>
                                        <span>{change.description}</span>
                                        <div className="space-x-2 text-sm">
                                            {change.commit && (
                                                <a
                                                    href={`https://github.com/hanami-osu/osu-guessr/commit/${change.commit}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline inline-block"
                                                >
                                                    [commit]
                                                </a>
                                            )}
                                            {change.pr && (
                                                <a
                                                    href={`https://github.com/hanami-osu/osu-guessr/pull/${change.pr}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline inline-block"
                                                >
                                                    [PR #{change.pr}]
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
