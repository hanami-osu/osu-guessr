"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslationsContext } from "@/context/translations-provider";
import { GAME_MODES } from "@/app/games/config";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import PreGameMenu from "@/app/games/shared/pages/PreGameMenu";
import { GameMode } from "@/actions/types";

function ScorePpPreview() {
    return (
        <div className="relative aspect-[16/9] overflow-hidden bg-card">
            <Image src="/main_bg.webp" alt="" fill sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw" className="object-cover opacity-35" />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/45 to-card/90" />
            <div className="absolute inset-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4 sm:p-5">
                <div className="min-w-0 border border-border/55 bg-background/75 p-3 backdrop-blur-sm">
                    <div className="truncate text-[11px] font-semibold text-muted-foreground">#2,481 · player one</div>
                    <div className="mt-2 font-mono text-xl font-bold tabular-nums text-foreground">???pp</div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">98.72% · 1,234x</div>
                </div>
                <div className="text-xs font-bold text-primary">VS</div>
                <div className="min-w-0 border border-border/55 bg-background/75 p-3 text-right backdrop-blur-sm">
                    <div className="truncate text-[11px] font-semibold text-muted-foreground">#6,914 · player two</div>
                    <div className="mt-2 font-mono text-xl font-bold tabular-nums text-foreground">???pp</div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">99.11% · 987x</div>
                </div>
            </div>
        </div>
    );
}

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
        <section className="scroll-mt-24 py-6 md:py-8" id="gamemodes">
            <div className="page-container">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                    <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />
                    {t.gameModes.title}
                </h2>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {GAME_MODES.map((mode) => (
                        <Link
                            key={mode.id}
                            href={`/?game=${mode.id}`}
                            scroll={false}
                            onClick={() => {
                                openedFromCard.current = true;
                            }}
                            className="group block overflow-hidden rounded-xl bg-muted/35 ring-1 ring-inset ring-border/35 transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                        >
                            {mode.id === GameMode.ScorePp ? (
                                <ScorePpPreview />
                            ) : (
                                <div className="relative aspect-[16/9] overflow-hidden bg-card">
                                    <Image
                                        src={mode.image || "/placeholder.svg"}
                                        alt=""
                                        fill
                                        sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                                        className="object-cover opacity-85 transition-[opacity,transform] duration-200 group-hover:scale-[1.015] group-hover:opacity-100"
                                    />
                                </div>
                            )}
                            <div className="p-4">
                                <h3 className="mb-1 text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">{t.gameModes.modes[mode.id].title}</h3>
                                <p className="text-foreground/70 text-sm leading-relaxed">{t.gameModes.modes[mode.id].description}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            <Dialog open={!!selectedGame} onOpenChange={(open) => !open && closeGameModal()}>
                {selectedGame && (
                    <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl border-border/50 bg-card p-0 sm:max-w-2xl">
                        <DialogTitle className="sr-only">{t.game.preGame.title[selectedGame.id]}</DialogTitle>
                        <PreGameMenu gameMode={selectedGame.id} onCancel={closeGameModal} onStart={(variant) => router.push(`${selectedGame.url}?variant=${variant}`)} />
                    </DialogContent>
                )}
            </Dialog>
        </section>
    );
}
