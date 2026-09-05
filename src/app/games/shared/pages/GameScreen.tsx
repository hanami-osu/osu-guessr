"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import { GameClient } from "@/lib/game/client";
import { GameState, GameMode } from "@/actions/types";

import { AUTO_ADVANCE_DELAY_MS, GameVariant } from "../../config";
import GameStats from "../components/GameStats";
import GuessInput from "../components/GuessInput";
import LoadingScreen from "../components/LoadingScreen";
import GameHeader from "../components/Header";
import { ReportDialog } from "@/components/ReportDialog";
import { AdSlider } from "@/components/Ads";
import { useTranslationsContext } from "@/context/translations-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { getDeathEndReason } from "@/lib/game/result";
import type { GameMediaProps } from "@/lib/game/types";
import { isClassicGameIncomplete } from "@/lib/game/completion";

interface GameScreenProps {
    onExit(): void;
    gameVariant: GameVariant;
    gameMode: GameMode;
    GameMedia: React.ComponentType<GameMediaProps>;
}

export default function GameScreen({ onExit, gameVariant, gameMode, GameMedia }: GameScreenProps) {
    const { t } = useTranslationsContext();

    const [gameState, setGameState] = useState<GameState | null>(null);
    const [guess, setGuess] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [countdown, setCountdown] = useState<number>(AUTO_ADVANCE_DELAY_MS / 1000);
    const [showStats, setShowStats] = useState(false);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [startupError, setStartupError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const gameClient = useRef<GameClient | null>(null);

    const handleStartGame = useCallback(async () => {
        try {
            setIsLoading(true);
            setShowStats(false);
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
                gameVariant
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

    const handleAction = useCallback(
        async (action: () => Promise<void>) => {
            if (isLoading) return;

            setIsLoading(true);
            setActionError(null);
            try {
                await action();
                setGuess("");
            } catch (error) {
                console.error("Action failed:", error);
                setActionError(error instanceof Error ? error.message : t.errors.game.unknown);
            } finally {
                setIsLoading(false);
            }
        },
        [isLoading, t.errors.game.unknown]
    );

    const handleGameComplete = useCallback(() => {
        if (!gameState || !gameClient.current) return;

        return handleAction(async () => {
            await gameClient.current!.endGame();
            setShowStats(true);
        });
    }, [gameState, handleAction]);

    const handleGuess = useCallback(() => {
        if (!gameClient.current || !guess.trim() || gameState?.currentBeatmap.revealed) return;
        return handleAction(() => gameClient.current!.submitGuess(guess));
    }, [guess, gameState?.currentBeatmap.revealed, handleAction]);

    const handleSkip = useCallback(() => {
        if (!gameClient.current || gameState?.currentBeatmap.revealed) return;

        return handleAction(async () => {
            await gameClient.current!.skipAnswer();
        });
    }, [gameState?.currentBeatmap.revealed, handleAction]);

    const handleNextRound = useCallback(async () => {
        if (!gameState?.currentBeatmap.revealed) return;

        if (gameVariant === "death" && gameState.lastGuess && !gameState.lastGuess.correct) {
            await handleGameComplete();
            return;
        }

        if (gameState.rounds.current >= gameState.rounds.total) {
            await handleGameComplete();
            return;
        }

        return handleAction(() => gameClient.current!.goNextRound());
    }, [gameState, gameVariant, handleAction, handleGameComplete]);

    const handleExit = useCallback(async (): Promise<boolean> => {
        if (!gameClient.current || !gameState) return false;

        const confirmation =
            gameVariant === "death"
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
            if (gameVariant === "death") {
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
            if (target instanceof HTMLElement && target.closest("button, a[href], input, textarea, select, summary, [contenteditable='true'], [role='button'], [role='link'], [role='menuitem'], [role='option']")) {
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
            <div className="container mx-auto flex min-h-[420px] items-center justify-center px-4 py-10">
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
        return (
            <GameStats
                totalPoints={gameState.score.total}
                correctGuesses={gameState.rounds.correctGuesses}
                maxStreak={gameState.score.highestStreak}
                totalRounds={gameState.rounds.total}
                averageTime={gameState.rounds.totalTimeUsed / gameState.rounds.current}
                onPlayAgain={handleStartGame}
                gameVariant={gameVariant}
                gameEndReason={gameVariant === "death" ? getDeathEndReason(gameState) : undefined}
            />
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <GameHeader
                streak={gameState.score.streak}
                points={gameState.score.total}
                timeLeft={gameState.timeLeft}
                currentRound={gameState.rounds.current}
                totalRounds={gameState.rounds.total}
                mode={gameMode}
                gameVariant={gameVariant}
                maxStreak={gameState.score.highestStreak}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <div className="relative">
                    <GameMedia
                        mediaUrl={gameMode === "audio" ? gameState.currentBeatmap.audioUrl! : gameState.currentBeatmap.imageUrl!}
                        isRevealed={gameState.currentBeatmap.revealed}
                        result={gameState.lastGuess}
                        songInfo={gameState.currentBeatmap}
                    />
                    {isLoading && <LoadingScreen />}
                </div>
                <div className="flex flex-col gap-6">
                    {actionError && (
                        <Alert variant="destructive" role="alert">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t.game.errors.actionFailed}</AlertTitle>
                            <AlertDescription>{actionError}</AlertDescription>
                        </Alert>
                    )}
                    <GuessInput guess={guess} setGuess={setGuess} isRevealed={gameState.currentBeatmap.revealed} isBusy={isLoading} onGuess={handleGuess} onSkip={handleSkip} gameClient={gameClient.current!} />

                    <div className="bg-card p-6 rounded-lg border border-border/60">
                        <h3 className="font-semibold mb-2">{t.game.shortcuts.title}</h3>
                        <ul className="list-disc list-inside space-y-1 text-foreground/70">
                            <li>{t.game.shortcuts.items.enter}</li>
                            <li>{t.game.shortcuts.items.ctrlS}</li>
                            <li>{t.game.shortcuts.items.arrows}</li>
                            <li>{t.game.shortcuts.items.esc}</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-8">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExit} disabled={isLoading}>
                        {gameVariant === "death" ? t.game.actions.endRun : t.game.actions.exitGame}
                    </Button>
                    {gameMode !== GameMode.Skin && gameState.currentBeatmap.revealed && gameState.currentBeatmap.mapsetId && (
                        <ReportDialog mapsetId={gameState.currentBeatmap.mapsetId} mapsetTitle={gameState.currentBeatmap.title || t.game.media.unknown} onOpenChange={setIsReportDialogOpen} />
                    )}
                </div>
                {gameState.currentBeatmap.revealed && (
                    <Button onClick={handleNextRound} className="px-8" disabled={isLoading}>
                        {gameState.rounds.current >= gameState.rounds.total
                            ? t.game.actions.viewResults
                            : isReportDialogOpen
                            ? t.game.actions.nextRound
                            : t.game.actions.nextRoundTime.replace("{seconds}", countdown.toString())}
                    </Button>
                )}
            </div>

            <AdSlider />
        </div>
    );
}
