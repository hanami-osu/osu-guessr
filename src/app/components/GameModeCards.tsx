"use client";
import Link from "next/link";
import Image from "next/image";
import { useTranslationsContext } from "@/context/translations-provider";
import { GAME_MODES } from "@/app/games/config";

export default function GameModeCards() {
    const { t } = useTranslationsContext();
    return (
        <section className="py-14 md:py-16 bg-background" id="gamemodes">
            <div className="container mx-auto px-4">
                <h2 className="mb-8 text-center text-3xl font-bold text-foreground md:mb-10">{t.gameModes.title}</h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
                    {GAME_MODES.map((mode, index) => (
                        <div key={mode.id} className={`motion-fade-up ${index === 1 ? "motion-delay-1" : index === 2 ? "motion-delay-2" : ""}`}>
                            <Link href={mode.url} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg">
                                <div className="interactive-surface relative h-64 overflow-hidden rounded-lg border border-border/60 bg-card group-hover:border-primary/40 sm:h-72 md:h-64 lg:h-72">
                                    <Image src={mode.image || "/placeholder.svg"} alt={t.gameModes.modes[mode.id].title} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover opacity-65 transition-[transform,opacity,filter] duration-500 ease-[var(--ease-out-smooth)] group-hover:scale-[1.035] group-hover:opacity-75" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent transition-opacity duration-300 ease-[var(--ease-out-smooth)] group-hover:opacity-90"></div>
                                    <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
                                        <h3 className="mb-2 text-xl font-bold text-primary transition-colors duration-200 group-hover:text-primary/90 lg:text-2xl">{t.gameModes.modes[mode.id].title}</h3>
                                        <p className="text-foreground/70 text-sm leading-relaxed">{t.gameModes.modes[mode.id].description}</p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
