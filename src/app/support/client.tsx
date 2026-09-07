"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Coffee, AlertCircle } from "lucide-react";

export function SupportPageContent() {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto px-4 py-8 md:py-10">
            <div className="mx-auto flex max-w-xl flex-col gap-7">
                <div className="text-center flex flex-col gap-3">
                    <h1 className="text-3xl font-bold">{t.support.title}</h1>
                    <p className="text-base leading-relaxed text-muted-foreground">{t.support.description}</p>
                </div>

                <section className="flex flex-col gap-4 border-t border-border/60 pt-6">
                    <h2 className="text-xl font-bold">{t.support.benefits.title}</h2>
                    <ul className="flex flex-col gap-2">
                        {Object.values(t.support.benefits.items).map((benefit, index) => (
                            <li key={index} className="flex items-center gap-2.5 text-sm text-foreground">
                                <span>•</span>
                                <span>{benefit}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="flex flex-col gap-4">
                    <h2 className="text-xl font-bold">{t.support.donate.title}</h2>
                    <Alert className="border-yellow-500/50 bg-yellow-500/10 text-foreground [&>svg]:text-yellow-500">
                        <AlertCircle />
                        <AlertDescription>{t.support.donate.reminder}</AlertDescription>
                    </Alert>
                    <a
                        href="https://www.buymeacoffee.com/yorunoken"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                    >
                        <div className="mb-3 flex items-center gap-3">
                            <Coffee className="h-5 w-5 text-primary" />
                            <span className="text-lg font-medium">{t.support.donate.button}</span>
                        </div>
                        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{t.support.donate.description}</p>
                        <Button className="w-full bg-primary hover:bg-primary/90">{t.support.donate.button}</Button>
                    </a>
                </section>
            </div>
        </div>
    );
}
