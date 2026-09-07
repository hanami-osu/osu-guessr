"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ROUND_TIME, BASE_POINTS, SKIP_PENALTY, STREAK_BONUS, TIME_BONUS_MULTIPLIER, MAX_ROUNDS, GAME_MODES, GameVariant } from "../../config";
import { useTranslationsContext } from "@/context/translations-provider";
import { GameMode } from "@/actions/types";

interface PreGameMenuProps {
    onStart(variant: GameVariant): void;
    gameMode: GameMode;
}

export default function PreGameMenu({ onStart, gameMode }: PreGameMenuProps) {
    const { t } = useTranslationsContext();
    const [selectedMode, setSelectedMode] = useState<GameVariant>("classic");

    const descriptions = t.game.preGame.description as Record<string, string>;
    const gameDescription = descriptions[gameMode] || descriptions.background;
    const modeArtwork = GAME_MODES.find((mode) => mode.id === gameMode)?.image ?? "/ghostrule.webp";
    const sectionTitleClass = "mb-4 text-base font-semibold text-foreground";
    const listClass = "flex flex-col gap-3 text-sm leading-relaxed text-foreground/70";

    const ClassicModeContent = () => (
        <div>
            <h2 className={sectionTitleClass}>{t.game.preGame.howToPlay.title}</h2>
            <ul className={listClass}>
                <li>• {gameDescription}</li>
                <li>• {t.game.preGame.howToPlay.classic.rounds.replace("{count}", MAX_ROUNDS.toString())}</li>
                <li>• {t.game.preGame.howToPlay.classic.time.replace("{seconds}", ROUND_TIME.toString())}</li>
                <li>• {t.game.preGame.howToPlay.classic.points}</li>
                <li>• {t.game.preGame.howToPlay.classic.streak}</li>
            </ul>
        </div>
    );

    const DeathModeContent = () => (
        <div>
            <h2 className={sectionTitleClass}>{t.game.preGame.howToPlay.title}</h2>
            <ul className={listClass}>
                <li>• {gameDescription}</li>
                <li>• {t.game.preGame.howToPlay.death.continuous}</li>
                <li>• {t.game.preGame.howToPlay.death.time.replace("{seconds}", ROUND_TIME.toString())}</li>
            </ul>
        </div>
    );

    return (
        <div className="relative isolate overflow-hidden">

            <div className="container relative mx-auto px-4 py-8 md:py-14">
                <div className="mx-auto max-w-4xl">
                    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                        <div className="relative h-44 overflow-hidden sm:h-56">
                            <Image src={modeArtwork} alt="" fill priority sizes="(min-width: 1024px) 896px, 100vw" className="object-cover opacity-75" />
                            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/65 to-background/20" />
                            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                                <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t.game.preGame.title[gameMode as keyof typeof t.game.preGame.title]}</h1>
                            </div>
                        </div>

                        <div className="space-y-6 p-5 sm:p-8">
                            <div>
                                <div className="mb-3 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="mt-1 text-sm text-muted-foreground">{gameDescription}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Button onClick={() => setSelectedMode("classic")} variant={selectedMode === "classic" ? "default" : "outline"} className="h-auto min-h-24 flex-col items-start gap-2 whitespace-normal rounded-lg p-4 text-left active:!transform-none" data-selected={selectedMode === "classic"} aria-pressed={selectedMode === "classic"}>
                                        <span className="text-lg font-semibold">{t.game.preGame.modes.classic.title}</span>
                                        <span className={selectedMode === "classic" ? "text-sm text-primary-foreground/80" : "text-sm text-muted-foreground"}>{t.game.preGame.modes.classic.description}</span>
                                    </Button>
                                    <Button
                                        onClick={() => setSelectedMode("death")}
                                        variant={selectedMode === "death" ? "destructive" : "outline"}
                                        className={`h-auto min-h-24 flex-col items-start gap-2 whitespace-normal rounded-lg p-4 text-left active:!transform-none ${selectedMode === "death" ? "hover:bg-destructive/90 hover:text-destructive-foreground" : "hover:bg-destructive/15 hover:text-destructive hover:border-destructive/50"}`}
                                        data-selected={selectedMode === "death"}
                                        aria-pressed={selectedMode === "death"}
                                    >
                                        <span className="text-lg font-semibold">{t.game.preGame.modes.death.title}</span>
                                        <span className={selectedMode === "death" ? "text-sm text-destructive-foreground/80" : "text-sm text-muted-foreground"}>{t.game.preGame.modes.death.description}</span>
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                                <div className="py-2">
                                    {selectedMode === "classic" ? <ClassicModeContent /> : <DeathModeContent />}
                                </div>
                                <div className="py-2">
                                    {selectedMode === "classic" ? (
                                        <div className="flex h-full flex-col justify-between gap-6">
                                            <div>
                                                <h2 className={sectionTitleClass}>{t.game.preGame.scoring.title}</h2>
                                                <ul className={listClass}>
                                                    <li>• {t.game.preGame.scoring.classic.base.replace("{points}", BASE_POINTS.toString())}</li>
                                                    <li>• {t.game.preGame.scoring.classic.timeBonus.replace("{points}", TIME_BONUS_MULTIPLIER.toString())}</li>
                                                    <li>• {t.game.preGame.scoring.classic.streakBonus.replace("{points}", STREAK_BONUS.toString())}</li>
                                                    <li>• {t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}</li>
                                                </ul>
                                            </div>
                                            <div className="border-l-2 border-border pl-4">
                                                <h2 className="mb-2 text-sm font-semibold text-foreground">{t.game.preGame.warning.title}</h2>
                                                <p className="text-sm leading-relaxed text-foreground/70">{t.game.preGame.warning.description.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <h2 className={sectionTitleClass}>{t.game.preGame.scoring.title}</h2>
                                            <ul className={listClass}>
                                                <li>• {t.game.preGame.scoring.death.streakOnly}</li>
                                                <li>• {t.game.preGame.scoring.death.noPoints}</li>
                                                <li>• {t.game.preGame.scoring.death.compete}</li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row">
                                <Button onClick={() => onStart(selectedMode)} className="h-12 flex-1 rounded-xl text-base" variant={selectedMode === "death" ? "destructive" : "default"}>
                                    {t.game.preGame.actions.startGame}
                                </Button>
                                <Button asChild variant="outline" className="h-12 flex-1 rounded-xl text-base">
                                    <Link href="/">
                                        {t.game.preGame.actions.backToHome}
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
