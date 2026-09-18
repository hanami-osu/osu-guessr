"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { GameClient } from "@/lib/game/client";
import { GameState, GameMode } from "@/actions/types";

import { AUTO_ADVANCE_DELAY_MS, GameVariant, MAX_ROUNDS, SURVIVAL_LIVES } from "../../config";
import GuessInput from "../components/GuessInput";
import LoadingScreen from "../components/LoadingScreen";
import GameHeader from "../components/Header";
import { ReportDialog } from "@/components/ReportDialog";
import { AdSlider } from "@/components/Ads";
import { useTranslationsContext } from "@/context/translations-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { GameMediaProps } from "@/lib/game/types";
import { canPersistGameResult, isClassicGameIncomplete } from "@/lib/game/completion";
import GameActionButton from "../components/GameActionButton";
import GameShortcuts from "../components/GameShortcuts";
import GameStartError from "../components/GameStartError";
import { useGameKeyboardShortcuts } from "../hooks/useGameKeyboardShortcuts";
import { usePreventUnload } from "../hooks/usePreventUnload";

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
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [startupError, setStartupError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const gameClient = useRef<GameClient | null>(null);

    const handleStartGame = useCallback(async () => {
        try {
            setIsLoading(true);
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
            router.replace(`/scores/${gameState.sessionId}`);
        });
    }, [gameState, handleAction, router]);

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
            gameVariant === "survival"
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
            const hasSavedScore = canPersistGameResult(
                {
                    variant: gameVariant,
                    currentRound: gameState.rounds.current,
                    hasGuessedCurrentRound: gameState.currentBeatmap.revealed,
                },
                MAX_ROUNDS,
            );
            if (hasSavedScore) {
                router.replace(`/scores/${gameState.sessionId}`);
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
    }, [gameState, onExit, gameVariant, router, t.confirmations.exitGame, t.errors.game.unknown]);

    usePreventUnload(Boolean(gameClient.current && gameState && gameVariant === "classic" && isClassicGameIncomplete(gameState)));

    useGameKeyboardShortcuts({
        disabled: isReportDialogOpen,
        onNextRound: gameState?.currentBeatmap.revealed ? handleNextRound : undefined,
    });

    useEffect(() => {
        if (gameState?.currentBeatmap.revealed && !isReportDialogOpen && !isLoading && !actionError) {
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
    }, [actionError, gameState?.currentBeatmap.revealed, handleNextRound, isLoading, isReportDialogOpen]);

    if (!gameState && startupError) {
        return <GameStartError message={startupError} onRetry={handleStartGame} />;
    }

    if (!gameState) return <div className="page-container relative min-h-[420px]"><LoadingScreen /></div>;

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
                    {isLoading && !gameState.currentBeatmap.revealed && <LoadingScreen />}
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
                        loadingLabel={isLoading ? (gameState.gameStatus === "finished" || gameState.rounds.current >= gameState.rounds.total ? t.common.loading : t.game.status.loading) : undefined}
                        nextRoundLabel={gameState.gameStatus === "finished" || gameState.rounds.current >= gameState.rounds.total
                            ? t.game.actions.viewResults
                            : t.game.actions.nextRoundTime.replace("{seconds}", String(countdown))}
                        gameClient={gameClient.current!}
                    />
                    <GameShortcuts hasSuggestions />
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                        <GameActionButton intent="exit" onClick={handleExit} disabled={isLoading}>
                            {gameVariant === "survival" ? t.game.actions.endRun : t.game.actions.exitGame}
                        </GameActionButton>
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
