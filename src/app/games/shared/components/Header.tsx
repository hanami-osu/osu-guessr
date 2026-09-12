import { ROUND_TIME, SURVIVAL_LIVES } from "../../config";
import { GameMode, type GameVariant } from "@/actions/types";
import { useTranslationsContext } from "@/context/translations-provider";
import { Heart, HeartCrack } from "lucide-react";

interface GameHeaderProps {
    streak: number;
    points: number;
    timeLeft: number;
    currentRound: number;
    totalRounds: number;
    mode: GameMode;
    gameVariant: GameVariant;
    maxStreak?: number;
    mistakes?: number;
    lifeCount?: number;
    timerDuration?: number;
}

export default function GameHeader({ streak, points, timeLeft, currentRound, totalRounds, mode, gameVariant, maxStreak = 0, mistakes = 0, lifeCount = SURVIVAL_LIVES, timerDuration = ROUND_TIME }: GameHeaderProps) {
    const { t, locale } = useTranslationsContext();
    const statClass = "min-w-0 border-l border-border/60 pl-4 first:border-l-0 first:pl-0 sm:pl-6 pr-4 sm:pr-6";
    const livesRemaining = Math.max(0, lifeCount - mistakes);

    return (
        <header className="mb-5">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {gameVariant === "classic" ? t.game.preGame.modes.classic.title : gameVariant === "survival" ? t.game.preGame.modes.death.title : "Death Mode"}
                    </div>
                    <h1 className="text-xl font-bold capitalize tracking-tight sm:text-2xl lg:text-3xl">{t.game.header.title.replace("{mode}", mode)}</h1>
                </div>
                <div className="shrink-0 text-right">
                    <div className={`font-mono text-3xl font-semibold tabular-nums sm:text-4xl lg:text-5xl ${timeLeft < 10 ? "text-destructive" : "text-foreground"}`}>
                        {t.game.header.timeLeft.replace("{seconds}", timeLeft.toString())}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-y-2 text-xs sm:text-sm lg:text-base">
                {gameVariant === "classic" ? (
                    <>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.classic.round.replace("{current}", currentRound.toString()).replace("{total}", totalRounds.toString())}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.classic.streak.replace("{count}", streak.toString())}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.classic.points.replace("{count}", points.toLocaleString(locale))}</div>
                        </div>
                    </>
                ) : gameVariant === "survival" ? (
                    <>
                        <div className={statClass}>
                            <div
                                className="flex items-center gap-1.5"
                                aria-label={t.game.header.death.lives.remaining.replace("{current}", livesRemaining.toString()).replace("{total}", lifeCount.toString())}
                            >
                                <span className="font-semibold">{t.game.header.death.lives.label}:</span>
                                {Array.from({ length: lifeCount }, (_, index) => {
                                    const lost = index < mistakes;
                                    const Icon = lost ? HeartCrack : Heart;

                                    return (
                                        <Icon
                                            key={index}
                                            aria-hidden="true"
                                            className={lost ? "size-5 fill-foreground/10 text-muted-foreground/50 sm:size-6" : "size-5 fill-destructive text-destructive sm:size-6"}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.death.currentStreak.replace("{count}", streak.toString())}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.death.maxStreak.replace("{count}", maxStreak.toString())}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.classic.points.replace("{count}", points.toLocaleString(locale))}</div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={statClass}>
                            <div className="font-semibold">{t.game.header.death.lives.oneShot}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.death.currentStreak.replace("{count}", streak.toString())}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.death.maxStreak.replace("{count}", maxStreak.toString())}</div>
                        </div>
                        <div className={statClass}>
                            <div className="font-semibold tabular-nums">{t.game.header.classic.points.replace("{count}", points.toLocaleString(locale))}</div>
                        </div>
                    </>
                )}
            </div>
            <div aria-hidden="true" className="mt-4 h-1 overflow-hidden bg-muted">
                <div className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${timeLeft < 10 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(0, Math.min(100, (timeLeft / timerDuration) * 100))}%` }} />
            </div>
        </header>
    );
}
