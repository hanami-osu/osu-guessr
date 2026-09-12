"use client";

import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useTranslationsContext } from "@/context/translations-provider";
import { useMemo } from "react";

export default function Hero() {
    const { data: session } = useSession();
    const { t } = useTranslationsContext();

    const titleParts = useMemo(() => {
        const parts = t.home.hero.title.split("osu!guessr");
        return parts;
    }, [t.home.hero.title]);

    const scrollToGamemodes = () => {
        const gamemodesElement = document.getElementById("gamemodes");
        gamemodesElement?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    };

    return (
        <section className="relative isolate overflow-hidden border-b border-primary/15">
            <div className="absolute inset-0 bg-[url('/main_bg.webp')] bg-cover bg-center"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30"></div>

            <div className="page-container relative z-10 py-14 sm:py-20 lg:py-24">
                <div className="max-w-3xl">
                    <h1 className="text-3xl font-semibold tracking-tight mb-4 leading-tight sm:text-4xl lg:text-5xl">
                        {titleParts[0]}
                        <span className="text-primary">osu!guessr</span>
                        {titleParts[1]}
                    </h1>

                    <p className="max-w-xl text-sm sm:text-base text-muted-foreground mb-6 leading-relaxed">{t.home.hero.subtitle}</p>

                    <div className="flex flex-col sm:flex-row gap-3">
                        {session ? (
                            <Button size="lg" onClick={scrollToGamemodes} className="text-sm px-6 w-full sm:w-auto">
                                {t.home.hero.startPlaying}
                            </Button>
                        ) : (
                            <Button size="lg" onClick={() => signIn("hanami")} className="text-sm px-6 w-full sm:w-auto">
                                {t.home.hero.signIn}
                            </Button>
                        )}
                        <Button asChild variant="outline" size="lg" className="text-sm px-6 w-full sm:w-auto bg-background/60">
                            <Link href="/about">{t.home.hero.learnMore}</Link>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="relative z-10 w-full border-t border-border/60 bg-background/65 py-3 backdrop-blur-sm">
                <div className="page-container flex flex-col sm:flex-row justify-between items-center gap-3 text-xs sm:text-sm">
                    <Link href={"https://twitter.com/Akariimia"} target="_blank" className="subtle-link text-foreground/65 hover:text-primary transition-colors">
                        {t.home.hero.artCredit}
                    </Link>
                </div>
            </div>
        </section>
    );
}
