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

                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    {GAME_MODES.map((mode, index) => (
                        <div key={mode.id} className={`motion-fade-up ${index === 1 ? "motion-delay-1" : index === 2 ? "motion-delay-2" : ""}`}>
                            <Link href={mode.url} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                                <div className="relative aspect-video overflow-hidden">
                                    <Image src={mode.image || "/placeholder.svg"} alt={t.gameModes.modes[mode.id].title} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover opacity-80 transition-opacity duration-200 group-hover:opacity-100" />
                                </div>
                                <div className="pt-4">
                                    <h3 className="mb-2 text-xl font-bold text-primary group-hover:underline lg:text-2xl">{t.gameModes.modes[mode.id].title}</h3>
                                    <p className="text-foreground/70 text-sm leading-relaxed">{t.gameModes.modes[mode.id].description}</p>
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
