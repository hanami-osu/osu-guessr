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

            <div className="container mx-auto max-w-6xl px-4 relative z-10 py-14 sm:py-20 lg:py-24">
                <div className="max-w-3xl">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-5 leading-tight">
                        {titleParts[0]}
                        <span className="text-primary">osu!guessr</span>
                        {titleParts[1]}
                    </h1>

                    <p className="max-w-xl text-base sm:text-lg text-foreground/75 mb-8 leading-relaxed">{t.home.hero.subtitle}</p>

                    <div className="flex flex-col sm:flex-row gap-3">
                        {session ? (
                            <Button size="lg" onClick={scrollToGamemodes} className="text-base sm:text-lg px-8 w-full sm:w-auto">
                                {t.home.hero.startPlaying}
                            </Button>
                        ) : (
                            <Button size="lg" onClick={() => signIn("osu")} className="text-base sm:text-lg px-8 w-full sm:w-auto">
                                {t.home.hero.signIn}
                            </Button>
                        )}
                        <Button asChild variant="outline" size="lg" className="text-base sm:text-lg px-8 w-full sm:w-auto bg-background/60">
                            <Link href="/about">{t.home.hero.learnMore}</Link>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="relative z-10 w-full px-4 py-3 bg-background/65 backdrop-blur-sm border-t border-white/10">
                <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row justify-between items-center gap-3 text-xs sm:text-sm">
                    <Link href={"https://twitter.com/Akariimia"} target="_blank" className="subtle-link text-foreground/65 hover:text-primary transition-colors">
                        {t.home.hero.artCredit}
                    </Link>
                </div>
            </div>
        </section>
    );
}
