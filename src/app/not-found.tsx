"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslationsContext } from "@/context/translations-provider";

export default function NotFound() {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto px-4 py-16">
            <div className="max-w-2xl mx-auto text-center">
                <div className="bg-card rounded-xl p-8 border border-border/50">
                    <h1 className="text-4xl font-bold mb-4">{t.errors["404"].title}</h1>

                    <div className="space-y-4 mb-8">
                        <p className="text-foreground/70">{t.errors["404"].description}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/">
                            <Button className="w-full sm:w-auto">{t.user.notFound.actions.home}</Button>
                        </Link>
                    </div>

                    <div className="mt-8 pt-6 border-t border-border/50">
                        <p className="text-sm text-foreground/50">
                            {t.errors["404"].reportIssue}{" "}
                            <Link href="https://github.com/hanami-osu/osu-guessr/issues" className="text-primary hover:underline">
                                https://github.com/hanami-osu/osu-guessr/issues
                            </Link>
                            .
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
