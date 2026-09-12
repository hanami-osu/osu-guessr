"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslationsContext } from "@/context/translations-provider";
import { GAME_MODES } from "@/app/games/config";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import PreGameMenu from "@/app/games/shared/pages/PreGameMenu";

export default function GameModeCards() {
    const { t } = useTranslationsContext();
    const router = useRouter();
    const searchParams = useSearchParams();
    const openedFromCard = useRef(false);
    const selectedGame = GAME_MODES.find((mode) => mode.id === searchParams.get("game"));

    const closeGameModal = () => {
        if (openedFromCard.current) {
            openedFromCard.current = false;
            router.back();
            return;
        }

        router.replace("/", { scroll: false });
    };

    return (
        <section className="scroll-mt-24 py-10 md:py-12" id="gamemodes">
            <div className="page-container">
                <h2 className="mb-6 text-2xl font-bold tracking-tight text-foreground">{t.gameModes.title}</h2>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    {GAME_MODES.map((mode) => (
                        <Link
                            key={mode.id}
                            href={`/?game=${mode.id}`}
                            scroll={false}
                            onClick={() => {
                                openedFromCard.current = true;
                            }}
                            className="group block border-t border-border pt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                        >
                            <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-card">
                                <Image src={mode.image || "/placeholder.svg"} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover opacity-85 transition-[opacity,transform] duration-200 group-hover:scale-[1.015] group-hover:opacity-100" />
                            </div>
                            <div className="pt-4">
                                <h3 className="mb-2 text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">{t.gameModes.modes[mode.id].title}</h3>
                                <p className="text-foreground/70 text-sm leading-relaxed">{t.gameModes.modes[mode.id].description}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            <Dialog open={!!selectedGame} onOpenChange={(open) => !open && closeGameModal()}>
                {selectedGame && (
                    <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto p-0 sm:max-w-4xl">
                        <DialogTitle className="sr-only">{t.game.preGame.title[selectedGame.id]}</DialogTitle>
                        <PreGameMenu
                            gameMode={selectedGame.id}
                            onCancel={closeGameModal}
                            onStart={(variant) => router.push(`${selectedGame.url}?variant=${variant}`)}
                        />
                    </DialogContent>
                )}
            </Dialog>
        </section>
    );
}
