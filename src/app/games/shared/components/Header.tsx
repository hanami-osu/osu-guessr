import { ROUND_TIME, getVariantLives } from "@/app/games/config";
import { GameMode, type GameRunType, type GameVariant } from "@/actions/types";
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
    gameRunType?: GameRunType;
    maxStreak?: number;
    mistakes?: number;
    lifeCount?: number;
    timerDuration?: number;
    gameOver?: boolean;
}

export default function GameHeader({
    streak,
    points,
    timeLeft,
    currentRound,
    totalRounds,
    mode,
    gameVariant,
    gameRunType = "standard",
    maxStreak = 0,
    mistakes = 0,
    lifeCount = getVariantLives(gameVariant),
    timerDuration = ROUND_TIME,
    gameOver = false,
}: GameHeaderProps) {
    const { t, locale } = useTranslationsContext();
    const statClass = "min-w-0 border-l border-border/60 pl-4 first:border-l-0 first:pl-0 sm:pl-6 pr-4 sm:pr-6";
    const livesRemaining = Math.max(0, lifeCount - mistakes);

    return (
        <header className="mb-5">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {gameRunType === "daily" ? t.game.preGame.modes.daily.title : gameVariant === "classic" ? t.game.preGame.modes.classic.title : gameVariant === "survival" ? t.game.preGame.modes.death.title : t.game.preGame.modes.oneLife.title}
                    </div>
                    <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">{t.game.preGame.title[mode as keyof typeof t.game.preGame.title]}</h1>
                </div>
                <div className="shrink-0 text-right">
                    {gameOver ? (
                        <div role="status" className="font-display text-2xl font-semibold tracking-tight text-destructive sm:text-3xl lg:text-4xl">
                            {t.game.header.death.lives.gameOver}
                        </div>
                    ) : (
                        <div className={`font-mono text-3xl font-semibold tabular-nums sm:text-4xl lg:text-5xl ${timeLeft < 10 ? "text-destructive" : "text-foreground"}`}>
                            {t.game.header.timeLeft.replace("{seconds}", timeLeft.toString())}
                        </div>
                    )}
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
                            <div className="flex items-center gap-1.5" aria-label={t.game.header.death.lives.remaining.replace("{current}", livesRemaining.toString()).replace("{total}", lifeCount.toString())}>
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
                <div
                    className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${timeLeft < 10 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${Math.max(0, Math.min(100, (timeLeft / timerDuration) * 100))}%` }}
                />
            </div>
        </header>
    );
}
