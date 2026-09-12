"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useState } from "react";
import { BASE_POINTS, GAME_MODES, GameVariant, MAX_ROUNDS, ROUND_TIME, SKIP_PENALTY, STREAK_BONUS, SURVIVAL_LIVES, TIME_BONUS_MULTIPLIER } from "../../config";
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
    const sectionTitleClass = "mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground";
    const listClass = "space-y-2";
    const listItemClass = "flex items-start gap-2 text-xs leading-5 text-muted-foreground sm:text-sm";
    const markerClass = "mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary/70";

    const ClassicModeContent = () => (
        <section>
            <h2 className={sectionTitleClass}><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.game.preGame.howToPlay.title}</h2>
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
            <h2 className={sectionTitleClass}><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.game.preGame.howToPlay.title}</h2>
            <ul className={listClass}>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.continuous}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.lives.replace("{count}", SURVIVAL_LIVES.toString())}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.time.replace("{seconds}", ROUND_TIME.toString())}
                </li>
            </ul>
        </section>
    );

    return (
        <div className="overflow-hidden rounded-2xl bg-card">
            <div>
                <header className="relative isolate overflow-hidden px-5 pb-5 pt-12 sm:px-7 sm:pb-6 sm:pt-16">
                    <Image src={modeArtwork} alt="" fill priority sizes="(min-width: 896px) 896px, 100vw" className="-z-20 object-cover object-center" />
                    <div aria-hidden="true" className="absolute -inset-px -z-10 bg-gradient-to-t from-card from-5% via-card/85 to-card/40" />
                    <div className="min-w-0 pr-6">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}</h1>
                        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{gameDescription}</p>
                    </div>
                </header>

                <section className="relative z-10 -mt-px bg-card">
                    <div className="grid grid-cols-2 gap-2 bg-muted/35 px-3 py-2.5 sm:px-5" role="radiogroup" aria-label={t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("classic")}
                            className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === "classic" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            aria-checked={selectedMode === "classic"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold">{t.game.preGame.modes.classic.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.classic.description.replace("{count}", MAX_ROUNDS.toString())}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("survival")}
                            className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === "survival" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            aria-checked={selectedMode === "survival"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold">{t.game.preGame.modes.death.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.death.description.replace("{count}", SURVIVAL_LIVES.toString())}</span>
                            </span>
                        </button>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-7 sm:px-7">
                    {selectedMode === "classic" ? <ClassicModeContent /> : <SurvivalModeContent />}

                    <section className="border-t border-border/60 pt-5 sm:border-l sm:border-t-0 sm:pl-7 sm:pt-0">
                        <h2 className={sectionTitleClass}><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.game.preGame.scoring.title}</h2>
                        {selectedMode === "classic" ? (
                            <ul className={listClass}>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.classic.base.replace("{points}", BASE_POINTS.toString())}
                                </li>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.classic.timeBonus.replace("{points}", TIME_BONUS_MULTIPLIER.toString())}
                                </li>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.classic.streakBonus.replace("{points}", STREAK_BONUS.toString())}
                                </li>
                                <li className={listItemClass}>
                                    <span aria-hidden="true" className={markerClass} />
                                    {t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}
                                </li>
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
                                    {t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}
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

                <div className="flex flex-col gap-4 border-t border-border/50 bg-muted/35 px-5 py-4 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
                    {selectedMode === "classic" && (
                        <section className="min-w-0 max-w-2xl">
                            <h2 className="text-xs font-semibold text-foreground">{t.game.preGame.warning.title}</h2>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.game.preGame.warning.description.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                        </section>
                    )}

                    <div className={`flex shrink-0 gap-2 ${selectedMode === "survival" ? "lg:ml-auto" : ""}`}>
                        <Button onClick={() => onStart(selectedMode)} className="h-11 min-w-36 flex-1 px-5 sm:flex-none" variant="default">
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
