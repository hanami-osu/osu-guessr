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
import MultiplayerStandings from "../components/MultiplayerStandings";
import MultiplayerChat from "../components/MultiplayerChat";
import { useGameKeyboardShortcuts } from "../hooks/useGameKeyboardShortcuts";
import { usePreventUnload } from "../hooks/usePreventUnload";
import { useMultiplayerSocket } from "@/lib/multiplayer-socket";

interface GameScreenProps {
    onExit(): void;
    gameVariant: GameVariant;
    gameMode: GameMode;
    GameMedia: React.ComponentType<GameMediaProps>;
    multiplayerLobbyCode?: string;
}

export default function GameScreen({ onExit, gameVariant, gameMode, GameMedia, multiplayerLobbyCode }: GameScreenProps) {
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
    const navigatingToResults = useRef(false);
    const multiplayerAdvanceDeadline = useRef<{ key: string; at: number } | null>(null);
    const publicStatsRef = useRef<{ points: number; streak: number; highestStreak: number; mistakes: number } | null>(null);
    const scoreUrl = useCallback(
        (sessionId: string) => multiplayerLobbyCode ? `/scores/${sessionId}?lobby=${encodeURIComponent(multiplayerLobbyCode)}` : `/scores/${sessionId}`,
        [multiplayerLobbyCode],
    );
    const currentRound = gameState?.rounds.current;
    const roundRevealed = gameState?.currentBeatmap.revealed;
    const {
        lobby: multiplayerLobby,
        userId: multiplayerUserId,
        presenceUserIds,
        roundState: multiplayerRoundState,
        error: multiplayerError,
        request: multiplayerRequest,
        sendReady,
        sendChat,
    } = useMultiplayerSocket(multiplayerLobbyCode, currentRound);

    useEffect(() => {
        if (!gameState || gameState.currentBeatmap.revealed) return;
        publicStatsRef.current = {
            points: gameState.score.total,
            streak: gameState.score.streak,
            highestStreak: gameState.score.highestStreak,
            mistakes: gameState.rounds.mistakes,
        };
    }, [gameState]);

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
                {},
                multiplayerLobbyCode,
                multiplayerRequest,
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
    }, [gameMode, gameVariant, multiplayerLobbyCode, multiplayerRequest, t.errors.game.unknown]);

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

    const handleGameComplete = useCallback(async () => {
        if (!gameState || !gameClient.current || navigatingToResults.current) return;

        navigatingToResults.current = true;
        setIsLoading(true);
        setActionError(null);
        try {
            await gameClient.current!.endGame();
            router.replace(scoreUrl(gameState.sessionId));
        } catch (error) {
            navigatingToResults.current = false;
            setIsLoading(false);
            console.error("Failed to end game:", error);
            setActionError(error instanceof Error ? error.message : t.errors.game.unknown);
        }
    }, [gameState, router, scoreUrl, t.errors.game.unknown]);

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
        if (!gameState?.currentBeatmap.revealed || navigatingToResults.current) return;

        if (multiplayerLobbyCode) {
            if (!multiplayerRoundState?.allSubmitted) return;
            if (!multiplayerRoundState.ready) {
                sendReady(gameState.rounds.current);
                return;
            }
            if (!multiplayerRoundState.allReady) return;
        }

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
    }, [gameState, handleAction, handleGameComplete, multiplayerLobbyCode, multiplayerRoundState, sendReady]);

    const waitingForGuesses = Boolean(multiplayerLobbyCode && roundRevealed && !multiplayerRoundState?.allSubmitted);
    const waitingForReady = Boolean(multiplayerRoundState?.ready && !multiplayerRoundState.allReady);
    const revealed = Boolean(roundRevealed);
    const resultVisible = !multiplayerLobbyCode || Boolean(multiplayerRoundState?.allSubmitted);
    const publicStats = waitingForGuesses ? publicStatsRef.current : null;
    const canAdvanceRound = !multiplayerLobbyCode || Boolean(multiplayerRoundState?.allSubmitted);
    const showAdvanceCountdown = revealed && canAdvanceRound;
    const participantCount = multiplayerRoundState?.participantCount ?? multiplayerLobby?.players.length ?? 0;
    const waitingLabel = t.game.status.waitingForPlayers
        .replace("{submitted}", String(multiplayerRoundState?.submittedCount ?? 0))
        .replace("{total}", String(participantCount));
    const readyLabel = t.game.status.readyPlayers
        .replace("{ready}", String(multiplayerRoundState?.readyCount ?? 0))
        .replace("{total}", String(participantCount));
    const isFinalRound = Boolean(gameState && (gameState.gameStatus === "finished" || gameState.rounds.current >= gameState.rounds.total));
    const baseNextRoundLabel = isFinalRound
        ? t.game.actions.viewResults
        : t.game.actions.nextRoundTime.replace("{seconds}", String(countdown));
    const multiplayerNextRoundLabel = isFinalRound ? t.game.actions.viewResults : t.game.actions.nextRound;
    const nextRoundLabel = waitingForGuesses
        ? waitingLabel
        : multiplayerLobbyCode && revealed
          ? `${multiplayerNextRoundLabel} · ${readyLabel}`
          : baseNextRoundLabel;

    useEffect(() => {
        if (!revealed || !multiplayerRoundState?.ready || !multiplayerRoundState.allReady || isLoading) return;
        void handleNextRound();
    }, [handleNextRound, isLoading, multiplayerRoundState?.allReady, multiplayerRoundState?.ready, revealed]);

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
                router.replace(scoreUrl(gameState.sessionId));
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
    }, [gameState, onExit, gameVariant, router, scoreUrl, t.confirmations.exitGame, t.errors.game.unknown]);

    usePreventUnload(Boolean(gameClient.current && gameState && gameVariant === "classic" && isClassicGameIncomplete(gameState)));

    useGameKeyboardShortcuts({
        disabled: isReportDialogOpen,
        onNextRound: revealed && canAdvanceRound && !waitingForReady ? handleNextRound : undefined,
    });

    useEffect(() => {
        if (showAdvanceCountdown && !isReportDialogOpen && !isLoading && !actionError) {
            if (multiplayerLobbyCode && gameState) {
                const key = `${gameState.sessionId}:${gameState.rounds.current}`;
                if (multiplayerAdvanceDeadline.current?.key !== key) {
                    multiplayerAdvanceDeadline.current = { key, at: Date.now() + AUTO_ADVANCE_DELAY_MS };
                }

                const updateCountdown = () => {
                    const deadline = multiplayerAdvanceDeadline.current?.at ?? Date.now();
                    setCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
                };
                updateCountdown();

                const countdownInterval = window.setInterval(updateCountdown, 250);
                const advanceTimer = window.setTimeout(() => {
                    void handleNextRound();
                }, Math.max(0, multiplayerAdvanceDeadline.current.at - Date.now()));

                return () => {
                    window.clearInterval(countdownInterval);
                    window.clearTimeout(advanceTimer);
                };
            }

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
    }, [actionError, gameState, handleNextRound, isLoading, isReportDialogOpen, multiplayerLobbyCode, showAdvanceCountdown]);

    if (!gameState && startupError) {
        return <GameStartError message={startupError} onRetry={handleStartGame} />;
    }

    if (!gameState) return <div className="page-container relative min-h-[420px]"><LoadingScreen /></div>;

    return (
        <div className={`page-container py-4 md:py-6 ${multiplayerLobby ? "max-w-[88rem]" : ""}`}>
            <GameHeader
                streak={publicStats?.streak ?? gameState.score.streak}
                points={publicStats?.points ?? gameState.score.total}
                timeLeft={showAdvanceCountdown ? countdown : gameState.timeLeft}
                currentRound={gameState.rounds.current}
                totalRounds={gameState.rounds.total}
                mode={gameMode}
                gameVariant={gameVariant}
                maxStreak={publicStats?.highestStreak ?? gameState.score.highestStreak}
                mistakes={publicStats?.mistakes ?? gameState.rounds.mistakes}
                lifeCount={SURVIVAL_LIVES}
                timerDuration={showAdvanceCountdown ? AUTO_ADVANCE_DELAY_MS / 1000 : undefined}
            />
            <div className={`grid items-start gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] lg:gap-8 ${multiplayerLobby ? "lg:grid-cols-[13rem_minmax(0,1.6fr)_minmax(320px,1fr)]" : ""}`}>
                {multiplayerLobby && (
                    <div className="md:col-span-2 lg:col-span-1 lg:sticky lg:top-6">
                        <MultiplayerStandings
                            lobby={multiplayerLobby}
                            presenceUserIds={presenceUserIds}
                            currentUserId={multiplayerUserId}
                            currentRound={currentRound}
                        />
                    </div>
                )}
                <div className="relative min-w-0 bg-muted/30">
                    <GameMedia
                        mediaUrl={gameMode === "audio" ? gameState.currentBeatmap.audioUrl! : gameState.currentBeatmap.imageUrl!}
                        isRevealed={revealed}
                        result={resultVisible ? gameState.lastGuess : undefined}
                        songInfo={gameState.currentBeatmap}
                    />
                    {isLoading && !revealed && <LoadingScreen />}
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                    {actionError && (
                        <Alert variant="destructive" role="alert">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t.game.errors.actionFailed}</AlertTitle>
                            <AlertDescription>{actionError}</AlertDescription>
                        </Alert>
                    )}
                    {multiplayerError && !actionError && (
                        <Alert variant="destructive" role="alert">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t.game.errors.actionFailed}</AlertTitle>
                            <AlertDescription>{multiplayerError}</AlertDescription>
                        </Alert>
                    )}
                    <GuessInput
                        gameMode={gameMode}
                        gameVariant={gameVariant}
                        guess={guess}
                        setGuess={setGuess}
                        isRevealed={revealed}
                        revealedGuess={gameState.lastGuess?.type === "guess" ? guess : ""}
                        isBusy={isLoading || waitingForGuesses || waitingForReady}
                        onGuess={handleGuess}
                        onSkip={handleSkip}
                        onNextRound={handleNextRound}
                        loadingLabel={isLoading ? (gameState.gameStatus === "finished" || gameState.rounds.current >= gameState.rounds.total ? t.common.loading : t.game.status.loading) : undefined}
                        nextRoundLabel={nextRoundLabel}
                        gameClient={gameClient.current!}
                    />
                    <MultiplayerChat lobby={multiplayerLobby} sendMessage={sendChat} />
                    <GameShortcuts hasSuggestions />
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                        <GameActionButton intent="exit" onClick={handleExit} disabled={isLoading}>
                            {gameVariant === "survival" ? t.game.actions.endRun : t.game.actions.exitGame}
                        </GameActionButton>
                        {gameMode !== GameMode.Skin && revealed && resultVisible && gameState.currentBeatmap.mapsetId && (
                            <ReportDialog mapsetId={gameState.currentBeatmap.mapsetId} mapsetTitle={gameState.currentBeatmap.title || t.game.media.unknown} onOpenChange={setIsReportDialogOpen} />
                        )}
                    </div>
                </div>
            </div>

            <AdSlider compact />
        </div>
    );
}
