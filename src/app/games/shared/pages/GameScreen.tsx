"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

import { GameClient } from "@/lib/game/client";
import { GameState, GameMode } from "@/actions/types";

import { AUTO_ADVANCE_DELAY_MS, GameVariant, SURVIVAL_LIVES } from "../../config";
import GameStats from "../components/GameStats";
import GuessInput from "../components/GuessInput";
import LoadingScreen from "../components/LoadingScreen";
import GameHeader from "../components/Header";
import { ReportDialog } from "@/components/ReportDialog";
import { AdSlider } from "@/components/Ads";
import { useTranslationsContext } from "@/context/translations-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { getDeathEndReason, getSurvivalEndReason } from "@/lib/game/result";
import type { GameMediaProps } from "@/lib/game/types";
import { isClassicGameIncomplete } from "@/lib/game/completion";
import { SHORTCUTS_STORAGE_KEY } from "@/lib/game/preferences";

interface GameScreenProps {
    onExit(): void;
    gameVariant: GameVariant;
    gameMode: GameMode;
    GameMedia: React.ComponentType<GameMediaProps>;
}

export default function GameScreen({ onExit, gameVariant, gameMode, GameMedia }: GameScreenProps) {
    const { t } = useTranslationsContext();
    const router = useRouter();

    const [gameState, setGameState] = useState<GameState | null>(null);
    const [guess, setGuess] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [countdown, setCountdown] = useState<number>(AUTO_ADVANCE_DELAY_MS / 1000);
    const [showStats, setShowStats] = useState(false);
    const [statsEndReason, setStatsEndReason] = useState<"completed" | "died" | "ended" | undefined>();
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [startupError, setStartupError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const gameClient = useRef<GameClient | null>(null);

    const handleStartGame = useCallback(async () => {
        try {
            setIsLoading(true);
            setShowStats(false);
            setStatsEndReason(undefined);
            setGuess("");
            setGameState(null);
            setStartupError(null);
            setActionError(null);
            gameClient.current?.dispose();

            gameClient.current = new GameClient(
                {
                    onStateUpdate: setGameState,
                    onError: (error) => {
                        console.error("Game error:", error);
                        setActionError(error.message);
                    },
                },
                gameMode,
                gameVariant,
            );

            const resumed = await gameClient.current.resumeStoredGame();
            if (!resumed) {
                await gameClient.current.startGame();
            }

            setCountdown(AUTO_ADVANCE_DELAY_MS / 1000);
            setActionError(null);
        } catch (error) {
            console.error("Failed to restart game:", error);
            setStartupError(error instanceof Error ? error.message : t.errors.game.unknown);
        } finally {
            setIsLoading(false);
        }
    }, [gameMode, gameVariant, t.errors.game.unknown]);

    useEffect(() => {
        handleStartGame();

        return () => {
            gameClient.current?.dispose();
        };
    }, [handleStartGame]);

    useEffect(() => {
        try {
            setShortcutsOpen(window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) === "true");
        } catch {
            setShortcutsOpen(false);
        }
    }, []);

    const handleAction = useCallback(
        async (action: () => Promise<void>) => {
            if (isLoading) return;

            setIsLoading(true);
            setActionError(null);
            try {
                await action();
            } catch (error) {
                console.error("Action failed:", error);
                setActionError(error instanceof Error ? error.message : t.errors.game.unknown);
            } finally {
                setIsLoading(false);
            }
        },
        [isLoading, t.errors.game.unknown],
    );

    const handleGameComplete = useCallback(() => {
        if (!gameState || !gameClient.current) return;

        return handleAction(async () => {
            await gameClient.current!.endGame();
            if (gameVariant === "death" && gameState.score.highestStreak === 0) {
                setShowStats(true);
                return;
            }
            router.push(`/scores/${gameState.sessionId}`);
        });
    }, [gameState, gameVariant, handleAction, router]);

    const handleGuess = useCallback(() => {
        if (!gameClient.current || !guess.trim() || gameState?.currentBeatmap.revealed) return;
        return handleAction(() => gameClient.current!.submitGuess(guess));
    }, [guess, gameState?.currentBeatmap.revealed, handleAction]);

    const handleSkip = useCallback(() => {
        if (!gameClient.current || gameState?.currentBeatmap.revealed) return;

        return handleAction(async () => {
            await gameClient.current!.skipAnswer();
            setGuess("");
        });
    }, [gameState?.currentBeatmap.revealed, handleAction]);

    const handleNextRound = useCallback(async () => {
        if (!gameState?.currentBeatmap.revealed) return;

        if (gameState.gameStatus === "finished") {
            await handleGameComplete();
            return;
        }

        if (gameState.rounds.current >= gameState.rounds.total) {
            await handleGameComplete();
            return;
        }

        return handleAction(async () => {
            await gameClient.current!.goNextRound();
            setGuess("");
            setCountdown(AUTO_ADVANCE_DELAY_MS / 1000);
        });
    }, [gameState, handleAction, handleGameComplete]);

    const handleExit = useCallback(async (): Promise<boolean> => {
        if (!gameClient.current || !gameState) return false;

        const confirmation =
            gameVariant === "survival" || gameVariant === "death"
                ? t.confirmations.exitGame.death
                : isClassicGameIncomplete(gameState)
                  ? t.confirmations.exitGame.classic
                  : gameState.score.total > 0
                    ? t.confirmations.exitGame.classicComplete
                    : null;

        if (confirmation && !window.confirm(confirmation)) return false;

        setIsLoading(true);
        setActionError(null);
        try {
            await gameClient.current.endGame();
            if (gameVariant === "survival" || gameVariant === "death") {
                setStatsEndReason("ended");
                setShowStats(true);
            } else {
                onExit();
            }
            return true;
        } catch (error) {
            console.error("Failed to end game:", error);
            setActionError(error instanceof Error ? error.message : t.errors.game.unknown);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [gameState, onExit, gameVariant, t.confirmations.exitGame, t.errors.game.unknown]);

    useEffect(() => {
        if (!gameClient.current || !gameState) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (gameVariant === "classic" && isClassicGameIncomplete(gameState)) {
                e.preventDefault();
                e.returnValue = "";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [gameState, gameVariant]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Enter" || event.repeat || event.defaultPrevented || event.isComposing || !gameState?.currentBeatmap.revealed || isReportDialogOpen) return;
            if (document.querySelector('[role="dialog"][data-state="open"]')) return;

            const target = event.target;
            if (
                target instanceof HTMLElement &&
                target.closest("button, a[href], input, textarea, select, summary, [contenteditable='true'], [role='button'], [role='link'], [role='menuitem'], [role='option']")
            ) {
                return;
            }

            void handleNextRound();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [gameState?.currentBeatmap.revealed, handleNextRound, isReportDialogOpen]);

    useEffect(() => {
        if (gameState?.currentBeatmap.revealed && !isReportDialogOpen) {
            setCountdown(AUTO_ADVANCE_DELAY_MS / 1000);

            const countdownInterval = setInterval(() => {
                setCountdown((prev) => Math.max(0, prev - 1));
            }, 1000);

            const advanceTimer = setTimeout(() => {
                handleNextRound();
            }, AUTO_ADVANCE_DELAY_MS);

            return () => {
                clearInterval(countdownInterval);
                clearTimeout(advanceTimer);
            };
        }
    }, [gameState?.currentBeatmap.revealed, handleNextRound, isReportDialogOpen]);

    if (!gameState && startupError) {
        return (
            <div className="page-container flex min-h-[420px] items-center justify-center py-10">
                <Alert variant="destructive" className="max-w-lg">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t.game.errors.startFailed}</AlertTitle>
                    <AlertDescription className="mt-2 space-y-4">
                        <p>{startupError}</p>
                        <Button type="button" variant="outline" onClick={handleStartGame}>
                            {t.game.actions.retry}
                        </Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (!gameState) return <LoadingScreen />;

    if (showStats && gameState) {
        const playedRounds = gameState.rounds.correctGuesses + gameState.rounds.mistakes;

        return (
            <GameStats
                runPp={gameState.pp ?? 0}
                totalPoints={gameState.score.total}
                correctGuesses={gameState.rounds.correctGuesses}
                maxStreak={gameState.score.highestStreak}
                totalRounds={gameState.rounds.total}
                averageTime={playedRounds > 0 ? gameState.rounds.totalTimeUsed / playedRounds : 0}
                mistakes={gameState.rounds.mistakes}
                onPlayAgain={handleStartGame}
                gameVariant={gameVariant}
                gameEndReason={statsEndReason ?? (gameVariant === "survival" ? getSurvivalEndReason(gameState) : gameVariant === "death" ? getDeathEndReason(gameState) : undefined)}
            />
        );
    }

    return (
        <div className="page-container py-4 md:py-6">
            <GameHeader
                streak={gameState.score.streak}
                points={gameState.score.total}
                timeLeft={gameState.currentBeatmap.revealed ? countdown : gameState.timeLeft}
                currentRound={gameState.rounds.current}
                totalRounds={gameState.rounds.total}
                mode={gameMode}
                gameVariant={gameVariant}
                maxStreak={gameState.score.highestStreak}
                mistakes={gameState.rounds.mistakes}
                lifeCount={SURVIVAL_LIVES}
                timerDuration={gameState.currentBeatmap.revealed ? AUTO_ADVANCE_DELAY_MS / 1000 : undefined}
            />

            <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] lg:gap-8">
                <div className="relative min-w-0 bg-muted/30">
                    <GameMedia
                        mediaUrl={gameMode === "audio" ? gameState.currentBeatmap.audioUrl! : gameState.currentBeatmap.imageUrl!}
                        isRevealed={gameState.currentBeatmap.revealed}
                        result={gameState.lastGuess}
                        songInfo={gameState.currentBeatmap}
                    />
                    {isLoading && <LoadingScreen />}
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                    {actionError && (
                        <Alert variant="destructive" role="alert">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t.game.errors.actionFailed}</AlertTitle>
                            <AlertDescription>{actionError}</AlertDescription>
                        </Alert>
                    )}
                    <GuessInput
                        gameMode={gameMode}
                        gameVariant={gameVariant}
                        guess={guess}
                        setGuess={setGuess}
                        isRevealed={gameState.currentBeatmap.revealed}
                        revealedGuess={gameState.lastGuess?.type === "guess" ? guess : ""}
                        isBusy={isLoading}
                        onGuess={handleGuess}
                        onSkip={handleSkip}
                        onNextRound={handleNextRound}
                        nextRoundLabel={gameState.gameStatus === "finished" || gameState.rounds.current >= gameState.rounds.total
                            ? t.game.actions.viewResults
                            : t.game.actions.nextRound}
                        gameClient={gameClient.current!}
                    />
                    <details
                        open={shortcutsOpen}
                        onToggle={(event) => {
                            const open = event.currentTarget.open;
                            setShortcutsOpen(open);
                            try {
                                window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, String(open));
                            } catch {}
                        }}
                        className="border-border/60 pt-3 text-xs text-muted-foreground"
                    >
                        <summary className="w-fit cursor-pointer py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{t.game.shortcuts.title}</summary>
                        <div className="mt-2 space-y-2 leading-relaxed">
                            <p>{t.game.shortcuts.items.enter}</p>
                            <p>{t.game.shortcuts.items.ctrlS}</p>
                            <p>{t.game.shortcuts.items.arrows}</p>
                            <p>{t.game.shortcuts.items.esc}</p>
                        </div>
                    </details>
                    <div className="flex flex-wrap items-center gap-2 border-border/60 pt-3">
                        <Button variant="ghost" size="sm" onClick={handleExit} disabled={isLoading}>
                            {gameVariant === "survival" || gameVariant === "death" ? t.game.actions.endRun : t.game.actions.exitGame}
                        </Button>
                        {gameMode !== GameMode.Skin && gameState.currentBeatmap.revealed && gameState.currentBeatmap.mapsetId && (
                            <ReportDialog mapsetId={gameState.currentBeatmap.mapsetId} mapsetTitle={gameState.currentBeatmap.title || t.game.media.unknown} onOpenChange={setIsReportDialogOpen} />
                        )}
                    </div>
                </div>
            </div>

            <AdSlider compact />
        </div>
    );
}
