import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GameVariant, SURVIVAL_LIVES } from "../../config";
import { useTranslationsContext } from "@/context/translations-provider";

interface GameStatsProps {
    runPp: number;
    totalPoints: number;
    correctGuesses: number;
    maxStreak: number;
    totalRounds: number;
    averageTime: number;
    mistakes: number;
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
        <div className="py-4 text-center sm:text-left">
            <div className="text-2xl font-semibold tabular-nums text-foreground">{value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
        </div>
    );
}

export default function GameStats({ runPp, totalPoints, correctGuesses, maxStreak, totalRounds, averageTime, mistakes, onPlayAgain, gameVariant, gameEndReason }: GameStatsProps) {
    const { t, locale } = useTranslationsContext();
    const isSurvival = gameVariant === "survival";
    const isContinuous = isSurvival || gameVariant === "death";
    const died = isContinuous && gameEndReason === "died";
    const livesRemaining = Math.max(0, SURVIVAL_LIVES - mistakes);
    const title = isContinuous
        ? gameEndReason === "died"
            ? t.game.stats.death.title.died
            : gameEndReason === "ended"
              ? t.game.stats.death.title.ended
              : t.game.stats.death.title.completed
        : t.game.stats.classic.title;

    return (
        <div className="page-container py-5 md:py-8">
            <div className="motion-fade-up">
                <header className="border-b border-border/60 pb-4">
                    <h1 className={`text-3xl font-bold tracking-tight sm:text-4xl ${died ? "text-destructive" : "text-foreground"}`}>{title}</h1>
                    {died && <p className="mt-2 text-sm font-medium text-destructive/90">{t.game.stats.death.diedMessage.replace("{count}", SURVIVAL_LIVES.toString())}</p>}
                </header>

                <section className="border-b border-border/60 py-5 sm:py-6">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.game.stats.labels.runPp}</div>
                    <div className="mt-2 text-5xl font-bold tabular-nums text-primary sm:text-6xl">{runPp.toLocaleString(locale, { maximumFractionDigits: 1 })}</div>
                </section>

                {isContinuous ? (
                    <>
                        <div className="grid grid-cols-2 divide-x divide-y divide-border/60 border-b border-border/60 sm:grid-cols-4 sm:divide-y-0">
                            <div className="pr-4 sm:pr-6">
                                <ResultStat label={t.game.stats.classic.totalPoints} value={totalPoints.toLocaleString(locale)} />
                            </div>
                            <div className="pl-4 sm:px-6">
                                <ResultStat label={t.game.stats.death.maxStreak} value={maxStreak} />
                            </div>
                            <div className="pr-4 pt-0 sm:px-6">
                                <ResultStat label={isSurvival ? t.game.stats.death.livesRemaining : t.game.stats.death.totalCorrect} value={isSurvival ? livesRemaining : correctGuesses} />
                            </div>
                            <div className="pl-4 pt-0 sm:pl-6">
                                <ResultStat label={t.game.stats.labels.averageTime} value={t.game.stats.classic.averageTime.replace("{time}", averageTime.toFixed(1))} />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
                            <div className="pr-4 sm:pr-6">
                                <ResultStat label={t.game.stats.classic.totalPoints} value={totalPoints.toLocaleString(locale)} />
                            </div>
                            <div className="px-4 sm:px-6">
                                <ResultStat
                                    label={t.game.stats.labels.correctGuesses}
                                    value={t.game.stats.classic.correctGuesses.replace("{correct}", correctGuesses.toString()).replace("{total}", totalRounds.toString())}
                                />
                            </div>
                            <div className="pl-4 sm:pl-6">
                                <ResultStat label={t.game.stats.labels.averageTime} value={t.game.stats.classic.averageTime.replace("{time}", averageTime.toFixed(1))} />
                            </div>
                        </div>
                    </>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <Button onClick={onPlayAgain} className="h-11 flex-1" variant={isContinuous ? "destructive" : "default"}>
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
