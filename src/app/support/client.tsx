"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check, Coffee, Info } from "lucide-react";

export function SupportPageContent() {
    const { t } = useTranslationsContext();
    const benefits = Object.values(t.support.benefits.items);

    return (
        <main className="page-container pb-6 pt-3 md:pb-8 md:pt-4">
            <div className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <header className="bg-muted/35 px-5 py-5 sm:px-7 md:px-9">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t.support.title}</h1>
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t.support.description}</p>
                </header>

                <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:divide-x lg:divide-border/60">
                    <section className="border-b border-border/60 px-5 py-5 sm:px-7 sm:py-6 lg:border-b-0 lg:pr-9">
                        <div className="mb-4 flex items-center gap-2 bg-muted/35 px-3 py-2.5">
                            <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />
                            <h2 className="text-sm font-semibold tracking-tight text-foreground">{t.support.benefits.title}</h2>
                        </div>

                        <div className="overflow-hidden rounded-xl bg-muted/35">
                            {benefits.map((benefit, index) => (
                                <div key={index} className="flex items-start gap-3 border-b border-border/35 px-3 py-3 last:border-b-0 sm:px-4">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                        <Check className="size-3" strokeWidth={2.5} />
                                    </span>
                                    <p className="text-sm font-medium leading-6">{benefit}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="px-5 py-5 sm:px-7 sm:py-6 lg:pl-9">
                        <div className="mb-4 flex items-center gap-2 bg-muted/35 px-3 py-2.5 text-primary">
                            <Coffee className="size-4" />
                            <h2 className="text-sm font-semibold tracking-tight text-foreground">{t.support.donate.title}</h2>
                        </div>

                        <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t.support.donate.description}</p>

                        <div className="mt-4 flex items-start gap-3 rounded-lg bg-muted/35 px-3 py-3 text-sm leading-6 text-muted-foreground">
                            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                            <p>{t.support.donate.reminder}</p>
                        </div>

                        <Button asChild size="lg" className="mt-6 w-full justify-between px-5 text-base sm:w-auto sm:min-w-72">
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
        </main>
    );
}
