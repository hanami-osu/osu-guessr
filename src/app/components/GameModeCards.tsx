"use client";
import Link from "next/link";
import Image from "next/image";
import { useTranslationsContext } from "@/context/translations-provider";
import { GAME_MODES } from "@/app/games/config";

export default function GameModeCards() {
    const { t } = useTranslationsContext();
    return (
        <section className="scroll-mt-24 py-10 md:py-12" id="gamemodes">
            <div className="container mx-auto max-w-6xl px-4">
                <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">{t.gameModes.title}</h2>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    {GAME_MODES.map((mode) => (
                        <Link key={mode.id} href={mode.url} className="group block h-full overflow-hidden rounded-xl border border-white/10 bg-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                            <div className="relative aspect-[16/9] overflow-hidden border-b border-white/10">
                                <Image src={mode.image || "/placeholder.svg"} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover opacity-90 transition-opacity duration-150 group-hover:opacity-100" />
                            </div>
                            <div className="p-5 sm:p-6">
                                <h3 className="mb-2 text-xl font-bold text-foreground tracking-tight">{t.gameModes.modes[mode.id].title}</h3>
                                <p className="text-foreground/70 text-sm leading-relaxed">{t.gameModes.modes[mode.id].description}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
