import { GameMode } from "@/actions/types";
import { useTranslationsContext } from "@/context/translations-provider";

interface GameHeaderProps {
    streak: number;
    points: number;
    timeLeft: number;
    currentRound: number;
    totalRounds: number;
    mode: GameMode;
    gameVariant: "classic" | "death";
    maxStreak?: number;
    lives?: number;
}

export default function GameHeader({ streak, points, timeLeft, currentRound, totalRounds, mode, gameVariant, maxStreak = 0, lives = 1 }: GameHeaderProps) {
    const { t } = useTranslationsContext();
    const pillClass = "bg-primary/10 text-primary px-4 py-1.5 rounded-full ring-1 ring-primary/15 transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out-smooth)]";

    const getLivesDisplay = (lives: number) => {
        if (lives === 1) {
            return (
                <div className={pillClass}>
                    <span className="font-semibold">{t.game.header.death.lives.oneShot}</span>
                </div>
            );
        } else {
            return (
                <div className="bg-destructive/20 text-destructive px-4 py-1.5 rounded-full ring-1 ring-destructive/20 transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out-smooth)]">
                    <span className="font-semibold">{t.game.header.death.lives.gameOver}</span>
                </div>
            );
        }
    };

    return (
        <div className="motion-fade-up flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="w-full text-2xl font-bold capitalize sm:w-auto sm:text-3xl">{t.game.header.title.replace("{mode}", mode)}</h1>

                {gameVariant === "classic" ? (
                    <>
                        <div className={pillClass}>
                            <span className="font-semibold">{t.game.header.classic.round.replace("{current}", currentRound.toString()).replace("{total}", totalRounds.toString())}</span>
                        </div>
                        <div className={pillClass}>
                            <span className="font-semibold">{t.game.header.classic.streak.replace("{count}", streak.toString())}</span>
                        </div>
                        <div className={pillClass}>
                            <span className="font-semibold">{t.game.header.classic.points.replace("{count}", points.toString())}</span>
                        </div>
                    </>
                ) : (
                    <>
                        {getLivesDisplay(lives)}
                        <div className={pillClass}>
                            <span className="font-semibold">{t.game.header.death.currentStreak.replace("{count}", streak.toString())}</span>
                        </div>
                        <div className={pillClass}>
                            <span className="font-semibold">{t.game.header.death.maxStreak.replace("{count}", maxStreak.toString())}</span>
                        </div>
                    </>
                )}
            </div>
            <div className="self-start py-2 text-2xl font-mono tabular-nums lg:self-auto">
                <span className={timeLeft < 10 ? "text-destructive" : "text-foreground"}>{t.game.header.timeLeft.replace("{seconds}", timeLeft.toString())}</span>
            </div>
        </div>
    );
}
