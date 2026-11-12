"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import Link from "next/link";
import React from "react";

export default function Footer() {
    const { t } = useTranslationsContext();

    return (
        <footer className="border-t border-border bg-muted/30 py-5">
            <div className="page-container flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-foreground/80">
                    {t.components.footer.madeWith.split("{author}").map((part, index, array) => (
                        <React.Fragment key={index}>
                            {part}
                            {index < array.length - 1 && (
                                <a className="text-primary hover:text-primary/80 transition-colors duration-200" href="https://osu.ppy.sh/u/yorunoken" target="_blank" rel="noopener noreferrer">
                                    yorunoken
                                </a>
                            )}
                        </React.Fragment>
                    ))}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground">
                    <Link href="/about" className="hover:text-foreground transition-colors duration-200">
                        {t.components.footer.about}
                    </Link>
                    <a href="https://hanami.yorunoken.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors duration-200">
                        {t.components.footer.privacy}
                    </a>
                    <a href="https://hanami.yorunoken.com/legal/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors duration-200">
                        {t.components.footer.tos}
                    </a>
                    <a href="https://github.com/hanami-osu/osu-guessr" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors duration-200">
                        Source
                    </a>
                    <a href="https://github.com/hanami-osu/osu-guessr/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors duration-200">
                        AGPL-3.0
                    </a>
                </div>
            </div>
        </footer>
    );
}
