"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useState } from "react";
import { BASE_POINTS, GAME_MODES, GameVariant, MAX_ROUNDS, ROUND_TIME, SKIP_PENALTY, STREAK_BONUS, SURVIVAL_LIVES, TIME_BONUS_MULTIPLIER } from "../../config";
import { useTranslationsContext } from "@/context/translations-provider";
import { GameMode } from "@/actions/types";
import { ChevronDown } from "lucide-react";

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
        <div className="overflow-hidden rounded-xl bg-card">
            <div>
                <header className="relative isolate overflow-hidden px-5 pb-4 pt-10 sm:px-6 sm:pb-5 sm:pt-12">
                    <Image src={modeArtwork} alt="" fill priority sizes="(min-width: 896px) 896px, 100vw" className="-z-20 object-cover object-center" />
                    <div aria-hidden="true" className="absolute -inset-px -z-10 bg-gradient-to-t from-card from-5% via-card/85 to-card/40" />
                    <div className="min-w-0 pr-6">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}</h1>
                        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{gameDescription}</p>
                    </div>
                </header>

                <section className="relative z-10 -mt-px border-y border-border/60 bg-card">
                    <div className="grid grid-cols-2 gap-2 px-3 py-2.5 sm:px-5" role="radiogroup" aria-label={t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}>
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

                <div className="px-5 py-4 sm:px-6 sm:py-5">
                    {selectedMode === "classic" ? <ClassicModeContent /> : <SurvivalModeContent />}

                    <details className="group mt-4 border-t border-border/60 pt-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                            <span className="flex items-center gap-2"><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.game.preGame.scoring.title}</span>
                            <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="pt-3">
                            {selectedMode === "classic" ? (
                                <ul className={listClass}>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.classic.base.replace("{points}", BASE_POINTS.toString())}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.classic.timeBonus.replace("{points}", TIME_BONUS_MULTIPLIER.toString())}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.classic.streakBonus.replace("{points}", STREAK_BONUS.toString())}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.classic.pp}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.death.compete}</li>
                                </ul>
                            ) : (
                                <ul className={listClass}>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.death.score}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.death.streakOnly}</li>
                                    <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.scoring.death.compete}</li>
                                </ul>
                            )}
                        </div>
                    </details>

                    {selectedMode === "classic" && (
                        <section className="mt-4 border-t border-border/60 pt-3">
                            <h2 className="text-xs font-semibold text-foreground">{t.game.preGame.warning.title}</h2>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.game.preGame.warning.description.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                        </section>
                    )}
                </div>

                <div className="border-t border-border/60 px-5 py-4 sm:px-6">
                    <div className="flex gap-2 sm:justify-end">
                        <Button onClick={() => onStart(selectedMode)} className="h-11 flex-1 px-5 sm:flex-none sm:min-w-36" variant="default">
                            {t.game.preGame.actions.startGame}
                        </Button>
                        <Button type="button" variant="ghost" className="h-11 flex-1 px-4 sm:flex-none" onClick={onCancel}>
                            {t.game.preGame.actions.backToHome}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
