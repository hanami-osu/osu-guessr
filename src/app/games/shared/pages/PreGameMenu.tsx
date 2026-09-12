"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useState } from "react";
import { ROUND_TIME, MAX_ROUNDS, GAME_MODES, GameVariant } from "../../config";
import { useTranslationsContext } from "@/context/translations-provider";
import { GameMode } from "@/actions/types";

interface PreGameMenuProps {
    onStart(variant: GameVariant): void;
    onCancel(): void;
    gameMode: GameMode;
}

export default function PreGameMenu({ onStart, onCancel, gameMode }: PreGameMenuProps) {
    const { t } = useTranslationsContext();
    const [selectedMode, setSelectedMode] = useState<GameVariant>("classic");

    const descriptions = t.game.preGame.description as Record<string, string>;
    const gameDescription = descriptions[gameMode] || descriptions.background;
    const modeArtwork = GAME_MODES.find((mode) => mode.id === gameMode)?.image ?? "/ghostrule.webp";
    const sectionTitleClass = "mb-3 text-sm sm:text-base font-semibold tracking-tight text-foreground";
    const listClass = "space-y-2 sm:space-y-2.5";
    const listItemClass = "flex items-start gap-2 text-xs leading-5 text-foreground/80 sm:text-sm";
    const markerClass = "mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary/70";

    const ClassicModeContent = () => (
        <section>
            <h2 className={sectionTitleClass}>{t.game.preGame.howToPlay.title}</h2>
            <ul className={listClass}>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.classic.rounds.replace("{count}", MAX_ROUNDS.toString())}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.classic.time.replace("{seconds}", ROUND_TIME.toString())}
                </li>
            </ul>
        </section>
    );

    const SurvivalModeContent = () => (
        <section>
            <h2 className={sectionTitleClass}>{t.game.preGame.howToPlay.title}</h2>
            <ul className={listClass}>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.continuous}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.mistakes}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.time.replace("{seconds}", ROUND_TIME.toString())}
                </li>
            </ul>
        </section>
    );

    return (
        <div className="p-5 sm:p-6">
            <div className="motion-fade-up">
                <header className="flex flex-col gap-5 border-b border-border/60 pb-5 pr-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}</h1>
                        <p className="mt-2 max-w-xl text-sm leading-5 text-foreground/65 sm:text-base">{gameDescription}</p>
                    </div>
                    <div className="relative hidden h-28 w-64 shrink-0 overflow-hidden bg-card sm:block">
                        <Image src={modeArtwork} alt="" fill priority sizes="(min-width: 640px) 256px, 100vw" className="object-cover opacity-90" />
                    </div>
                </header>

                <section className="border-b border-border/60 py-4">
                    <div className="grid max-w-2xl grid-cols-2 gap-1 sm:gap-3" role="radiogroup" aria-label={t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("classic")}
                            className={`press-feedback border-b-2 px-2 pb-3 pt-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selectedMode === "classic" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            aria-checked={selectedMode === "classic"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold sm:text-base">{t.game.preGame.modes.classic.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.classic.description}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("survival")}
                            className={`press-feedback border-b-2 px-2 pb-3 pt-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selectedMode === "survival" ? "border-destructive text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            aria-checked={selectedMode === "survival"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold sm:text-base">{t.game.preGame.modes.death.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.death.description}</span>
                            </span>
                        </button>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-5 border-b border-border/60 py-5 sm:grid-cols-2 md:gap-x-10">
                    {selectedMode === "classic" ? <ClassicModeContent /> : <SurvivalModeContent />}

                    <section>
                        <h2 className={sectionTitleClass}>{t.game.preGame.scoring.title}</h2>
                        {selectedMode === "classic" ? (
                            <ul className={listClass}>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.classic.pp}
                                </li>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.death.compete}
                                </li>
                            </ul>
                        ) : (
                            <ul className={listClass}>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.death.score}
                                </li>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.death.streakOnly}
                                </li>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.death.compete}
                                </li>
                            </ul>
                        )}
                    </section>
                </div>

                <div className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
                    {selectedMode === "classic" && (
                        <section className="min-w-0 max-w-2xl">
                            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{t.game.preGame.warning.title}</h2>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.game.preGame.warning.description.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                        </section>
                    )}

                    <div className={`flex shrink-0 gap-2 ${selectedMode === "survival" ? "lg:ml-auto" : ""}`}>
                        <Button onClick={() => onStart(selectedMode)} className="h-11 min-w-36 flex-1 px-5 sm:flex-none" variant={selectedMode === "survival" ? "destructive" : "default"}>
                            {t.game.preGame.actions.startGame}
                        </Button>
                        <Button type="button" variant="ghost" className="h-11 px-4" onClick={onCancel}>
                            {t.game.preGame.actions.backToHome}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
