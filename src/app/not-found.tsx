"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslationsContext } from "@/context/translations-provider";

export default function NotFound() {
    const { t } = useTranslationsContext();

    return (
        <div className="page-container py-16">
            <div className="max-w-2xl mx-auto text-center">
                <div className="py-8">
                    <h1 className="text-4xl font-bold mb-4">{t.errors["404"].title}</h1>

                    <div className="space-y-4 mb-8">
                        <p className="text-foreground/70">{t.errors["404"].description}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button asChild className="w-full sm:w-auto">
                            <Link href="/">{t.user.notFound.actions.home}</Link>
                        </Button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border/60">
                        <p className="text-sm text-foreground/50">
                            {t.errors["404"].reportIssue}{" "}
                            <a href="https://github.com/hanami-osu/osu-guessr/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
