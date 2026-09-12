"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check, Coffee, Info } from "lucide-react";

export function SupportPageContent() {
    const { t } = useTranslationsContext();
    const benefits = Object.values(t.support.benefits.items);

    return (
        <div className="page-container py-10 md:py-14 lg:py-16">
            <header className="max-w-3xl">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t.support.title}</h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t.support.description}</p>
            </header>

            <div className="mt-10 grid border-t border-border/60 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:divide-x lg:divide-border/60">
                <section className="py-8 lg:pr-10 lg:py-10">
                    <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t.support.benefits.title}</h2>

                    <div className="mt-6 divide-y divide-border/60 border-y border-border/60">
                        {benefits.map((benefit, index) => (
                            <div key={index} className="flex items-start gap-3 py-4 sm:py-5">
                                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <Check className="size-3.5" strokeWidth={2.5} />
                                </span>
                                <p className="text-sm font-medium leading-relaxed sm:text-base">{benefit}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="py-8 lg:py-10 lg:pl-10">
                    <div className="flex items-center gap-3 text-primary">
                        <Coffee className="size-6" />
                        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t.support.donate.title}</h2>
                    </div>

                    <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t.support.donate.description}</p>

                    <div className="mt-6 flex items-start gap-3 border-l-2 border-primary/60 pl-4 text-sm leading-relaxed text-muted-foreground">
                        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                        <p>{t.support.donate.reminder}</p>
                    </div>

                    <Button asChild size="lg" className="mt-8 w-full justify-between px-5 text-base sm:w-auto sm:min-w-72">
                        <a href="https://www.buymeacoffee.com/yorunoken" target="_blank" rel="noopener noreferrer">
                            <span className="flex items-center gap-2">
                                <Coffee className="size-4" />
                                {t.support.donate.button}
                            </span>
                            <ArrowUpRight className="size-4" />
                        </a>
                    </Button>
                </section>
            </div>
        </div>
    );
}
