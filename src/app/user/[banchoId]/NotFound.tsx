"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslationsContext } from "@/context/translations-provider";
import React from "react";

const StyledGameName = () => <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">osu!guessr</span>;

export default function UserNotFound() {
    const { t } = useTranslationsContext();

    return (
        <div className="page-container py-10 md:py-16">
            <div className="max-w-2xl mx-auto text-center">
                <div className="border-t border-border/60 pt-8">
                    <h1 className="text-3xl md:text-4xl font-bold mb-4">{t.user.notFound.title}</h1>

                    <div className="space-y-4 mb-8">
                        <p className="text-foreground/70">
                            {t.user.notFound.subDescription.split("{osu_guessr}").map((part: string, index: number, array: string[]) => (
                                <React.Fragment key={index}>
                                    {part}
                                    {index < array.length - 1 && <StyledGameName />}
                                </React.Fragment>
                            ))}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button asChild className="w-full sm:w-auto">
                            <Link href="/">{t.user.notFound.actions.home}</Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full sm:w-auto">
                            <Link href="/leaderboard">{t.user.notFound.actions.leaderboard}</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
