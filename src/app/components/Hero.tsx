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
        gamemodesElement?.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <section className="relative min-h-[80vh] overflow-hidden flex items-center py-20">
            <div className="absolute inset-0 bg-[url('/main_bg.webp')] bg-cover bg-center transition-transform duration-700 ease-[var(--ease-out-smooth)]"></div>
            <div className="absolute inset-0 bg-background/70"></div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="motion-fade-up text-4xl sm:text-5xl md:text-7xl font-bold mb-6 leading-tight">
                        {titleParts[0]}
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/70">osu!guessr</span>
                        {titleParts[1]}
                    </h1>

                    <p className="motion-fade-up motion-delay-1 text-lg md:text-2xl text-foreground/85 mb-10 leading-relaxed">{t.home.hero.subtitle}</p>

                    <div className="motion-fade-up motion-delay-2 flex flex-col sm:flex-row gap-4 justify-center">
                        {session ? (
                            <Button size="lg" onClick={scrollToGamemodes} className="text-base sm:text-lg px-8 w-full sm:w-auto">
                                {t.home.hero.startPlaying}
                            </Button>
                        ) : (
                            <Button size="lg" onClick={() => signIn("osu")} className="text-base sm:text-lg px-8 w-full sm:w-auto">
                                {t.home.hero.signIn}
                            </Button>
                        )}
                        <Link href="/about" className="w-full sm:w-auto">
                            <Button variant="outline" size="lg" className="text-base sm:text-lg px-8 w-full bg-background/60">
                                {t.home.hero.learnMore}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 w-full p-4 bg-background/55 backdrop-blur-sm border-t border-border/40">
                <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-sm sm:text-base">
                    <Link href={"https://twitter.com/Akariimia"} target="_blank" className="subtle-link text-foreground/90 hover:text-primary transition-colors">
                        {t.home.hero.artCredit}
                    </Link>

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <Link href={"https://osu.ppy.sh/users/yorunoken"} target="_blank" className="subtle-link flex items-center gap-2 text-foreground/90 hover:text-primary transition-colors">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.436 18.306a.927.927 0 0 1-1.31.001l-3.078-3.08a4.897 4.897 0 0 1-2.048.445 4.91 4.91 0 0 1-4.906-4.906 4.91 4.91 0 0 1 4.906-4.906 4.91 4.91 0 0 1 4.906 4.906c0 .727-.167 1.416-.463 2.033l3.08 3.079a.927.927 0 0 1-.087 1.428z" />
                            </svg>
                            {t.home.hero.developerCredit}
                        </Link>

                        <Link href={"https://discord.gg/qrud2g4CA5"} target="_blank" className="subtle-link flex items-center gap-2 text-foreground/90 hover:text-primary transition-colors">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                            </svg>
                            {t.home.hero.discordInvite}
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
