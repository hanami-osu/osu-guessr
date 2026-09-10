import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GameVariant } from "../../config";
import { useTranslationsContext } from "@/context/translations-provider";

interface GameStatsProps {
    totalPoints: number;
    correctGuesses: number;
    maxStreak: number;
    totalRounds: number;
    averageTime: number;
    onPlayAgain: () => void;
    gameVariant: GameVariant;
    gameEndReason?: "completed" | "died" | "ended";
}

interface ResultStatProps {
    label: string;
    value: string | number;
}

function ResultStat({ label, value }: ResultStatProps) {
    return (
        <div className="py-5 text-center sm:text-left">
            <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
        </div>
    );
}

export default function GameStats({ totalPoints, correctGuesses, maxStreak, totalRounds, averageTime, onPlayAgain, gameVariant, gameEndReason }: GameStatsProps) {
    const { t } = useTranslationsContext();
    const isDeath = gameVariant === "death";
    const died = isDeath && gameEndReason === "died";
    const title = isDeath
        ? gameEndReason === "died"
            ? t.game.stats.death.title.died
            : gameEndReason === "ended"
              ? t.game.stats.death.title.ended
              : t.game.stats.death.title.completed
        : t.game.stats.classic.title;

    return (
        <div className="container mx-auto max-w-3xl px-4 py-10 md:py-16">
            <div className="motion-fade-up">
                <header className="border-b border-border/60 pb-6">
                    <h1 className={`text-3xl font-bold tracking-tight sm:text-4xl ${died ? "text-destructive" : "text-foreground"}`}>{title}</h1>
                    {died && <p className="mt-2 text-sm font-medium text-destructive/90">{t.game.stats.death.diedMessage}</p>}
                </header>

                {isDeath ? (
                    <>
                        <section className="border-b border-border/60 py-8 sm:py-10">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.game.stats.death.maxStreak}</div>
                            <div className="mt-2 text-5xl font-bold tabular-nums text-primary sm:text-6xl">{maxStreak}</div>
                        </section>

                        <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
                            <div className="pr-5 sm:pr-8">
                                <ResultStat label={t.game.stats.death.totalCorrect} value={correctGuesses} />
                            </div>
                            <div className="pl-5 sm:pl-8">
                                <ResultStat label={t.game.stats.labels.averageTime} value={t.game.stats.classic.averageTime.replace("{time}", averageTime.toFixed(1))} />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <section className="border-b border-border/60 py-8 sm:py-10">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.game.stats.classic.totalPoints}</div>
                            <div className="mt-2 text-5xl font-bold tabular-nums text-primary sm:text-6xl">{totalPoints.toLocaleString()}</div>
                        </section>

                        <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
                            <div className="pr-4 sm:pr-6">
                                <ResultStat
                                    label={t.game.stats.labels.correctGuesses}
                                    value={t.game.stats.classic.correctGuesses.replace("{correct}", correctGuesses.toString()).replace("{total}", totalRounds.toString())}
                                />
                            </div>
                            <div className="px-4 sm:px-6">
                                <ResultStat label={t.game.stats.classic.highestStreak} value={maxStreak} />
                            </div>
                            <div className="pl-4 sm:pl-6">
                                <ResultStat label={t.game.stats.labels.averageTime} value={t.game.stats.classic.averageTime.replace("{time}", averageTime.toFixed(1))} />
                            </div>
                        </div>
                    </>
                )}

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button onClick={onPlayAgain} className="h-11 flex-1" variant={isDeath ? "destructive" : "default"}>
                        {t.game.stats.actions.tryAgain}
                    </Button>
                    <Button asChild variant="ghost" className="h-11 flex-1 border border-border/60">
                        <Link href="/">{t.game.stats.actions.backToHome}</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
