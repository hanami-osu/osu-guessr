"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslationsContext } from "@/context/translations-provider";

export default function NotFoundContent() {
    const { t } = useTranslationsContext();

    return (
        <div className="page-container py-16">
            <div className="mx-auto max-w-2xl text-center">
                <div className="py-8">
                    <h1 className="mb-4 text-4xl font-bold">{t.errors["404"].title}</h1>

                    <div className="mb-8 space-y-4">
                        <p className="text-foreground/70">{t.errors["404"].description}</p>
                    </div>

                    <div className="flex flex-col justify-center gap-4 sm:flex-row">
                        <Button asChild className="w-full sm:w-auto">
                            <Link href="/">{t.user.notFound.actions.home}</Link>
                        </Button>
                    </div>

                    <div className="mt-8 border-t border-border/60 pt-6">
                        <p className="text-sm text-foreground/50">
                            {t.errors["404"].reportIssue}{" "}
                            <a href="https://github.com/hanami-osu/osu-guessr/issues" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                GitHub
                            </a>
                            .
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
