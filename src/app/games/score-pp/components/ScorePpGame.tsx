"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslationsContext } from "@/context/translations-provider";
import { GameMode, type GameVariant } from "@/actions/types";
import { endScorePpRunAction, getScorePpRoundAction, getScorePpRunStateAction, startScorePpRunAction, submitScorePpGuessAction } from "@/actions/score-pp-server";
import type { ScorePpPublicPair, ScorePpPublicScore, ScorePpResolution, ScorePpRoundLoad, ScorePpRunState } from "@/lib/score-pp/types";
import { ReportDialog } from "@/components/ReportDialog";
import { LeaveGameDialog } from "@/components/LeaveGameDialog";
import GameActionButton from "../../shared/components/GameActionButton";
import GameShortcuts from "../../shared/components/GameShortcuts";
import GameStartError from "../../shared/components/GameStartError";
import { useGameKeyboardShortcuts } from "../../shared/hooks/useGameKeyboardShortcuts";
import { usePreventUnload } from "../../shared/hooks/usePreventUnload";
import GameHeader from "../../shared/components/Header";
import MultiplayerStandings from "../../shared/components/MultiplayerStandings";
import MultiplayerChat from "../../shared/components/MultiplayerChat";
import { AUTO_ADVANCE_DELAY_MS, MAX_ROUNDS, ROUND_TIME, SURVIVAL_LIVES } from "../../config";
import ScorePpCard from "./ScorePpCard";
import { useMultiplayerSocket } from "@/lib/multiplayer-socket";
import { useLeaveGameGuard } from "@/hooks/useLeaveGameGuard";

interface Exclusions {
    scoreIds: string[];
    userIds: number[];
    beatmapIds: number[];
}

type ScorePpError = "start" | "load" | "submit" | "end" | "unavailable";

const EMPTY_EXCLUSIONS: Exclusions = { scoreIds: [], userIds: [], beatmapIds: [] };

function addPairToExclusions(exclusions: Exclusions, pair: ScorePpPublicPair): Exclusions {
    if (exclusions.scoreIds.includes(pair.left.sourceScoreId) || exclusions.scoreIds.includes(pair.right.sourceScoreId)) return exclusions;
    return {
        scoreIds: [...new Set([...exclusions.scoreIds, pair.left.sourceScoreId, pair.right.sourceScoreId])],
        userIds: [...new Set([...exclusions.userIds, pair.left.player.userId, pair.right.player.userId])],
        beatmapIds: [...new Set([...exclusions.beatmapIds, pair.left.beatmap.beatmapId, pair.right.beatmap.beatmapId])],
    };
}

function scorePp(resolution: ScorePpResolution | null, score: ScorePpPublicScore): number | undefined {
    return resolution?.scorePp[score.sourceScoreId];
}

export default function ScorePpGame({ gameVariant, multiplayerLobbyCode }: { gameVariant: GameVariant; multiplayerLobbyCode?: string }) {
    const router = useRouter();
    const { t } = useTranslationsContext();
    const scoreUrl = useCallback(
        (runSessionId: string) => multiplayerLobbyCode ? `/multiplayer/${encodeURIComponent(multiplayerLobbyCode)}` : `/scores/${runSessionId}`,
        [multiplayerLobbyCode],
    );
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pair, setPair] = useState<ScorePpPublicPair | null>(null);
    const [resolution, setResolution] = useState<ScorePpResolution | null>(null);
    const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);
    const [round, setRound] = useState(1);
    const [requestedRound, setRequestedRound] = useState(1);
    const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
    const [revealCountdown, setRevealCountdown] = useState(AUTO_ADVANCE_DELAY_MS / 1000);
    const [points, setPoints] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [mistakes, setMistakes] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [exitDialogOpen, setExitDialogOpen] = useState(false);
    const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null);
    const [terminalRound, setTerminalRound] = useState(false);
    const [error, setError] = useState<ScorePpError | null>(null);
    const exclusions = useRef<Exclusions>(EMPTY_EXCLUSIONS);
    const deadline = useRef(0);
    const advancePausedRef = useRef(false);
    const multiplayerAdvanceDeadline = useRef<{ key: string; at: number } | null>(null);
    const publicStatsRef = useRef<{ points: number; streak: number; maxStreak: number; mistakes: number } | null>(null);
    const resolving = useRef(false);
    const starting = useRef(false);
    const loadingRound = useRef(false);
    const navigatingToResults = useRef(false);
    const {
        lobby: multiplayerLobby,
        userId: multiplayerUserId,
        presenceUserIds,
        roundState: multiplayerRoundState,
        error: multiplayerError,
        request: multiplayerRequest,
        sendReady,
        sendChat,
    } = useMultiplayerSocket(multiplayerLobbyCode, round);

    useEffect(() => {
        if (resolution) return;
        publicStatsRef.current = { points, streak, maxStreak, mistakes };
    }, [maxStreak, mistakes, points, resolution, streak]);

    const applyResolution = useCallback((result: ScorePpResolution) => {
        setSelectedScoreId(result.selectedScoreId);
        setResolution(result);
        setPoints(result.totalPoints);
        setStreak(result.streak);
        setMaxStreak(result.maxStreak);
        setMistakes(result.mistakes);
        setRevealCountdown(AUTO_ADVANCE_DELAY_MS / 1000);
        setTerminalRound(result.terminal);
    }, []);

    const applyRunState = useCallback((state: ScorePpRunState, runSessionId: string) => {
        setRound(state.round);
        setRequestedRound(state.round);
        setPoints(state.points);
        setStreak(state.streak);
        setMaxStreak(state.maxStreak);
        setMistakes(state.mistakes);

        if (state.terminal) {
            setTerminalRound(true);
            router.replace(state.saved ? scoreUrl(runSessionId) : "/");
            return;
        }

        setTerminalRound(false);
        setPair(state.pair);
        if (state.resolution) {
            applyResolution(state.resolution);
            return;
        }

        setResolution(null);
        setSelectedScoreId(null);
        if (state.deadlineAt !== null) {
            deadline.current = state.deadlineAt;
            setTimeLeft(Math.max(0, Math.ceil((state.deadlineAt - Date.now()) / 1000)));
        }
    }, [applyResolution, router, scoreUrl]);

    const recoverRun = useCallback(async (runSessionId: string): Promise<ScorePpRunState | null> => {
        try {
            const state = multiplayerLobbyCode
                ? await multiplayerRequest<ScorePpRunState>("score_pp.state", { sessionId: runSessionId })
                : await getScorePpRunStateAction(runSessionId);
            applyRunState(state, runSessionId);
            return state;
        } catch {
            return null;
        }
    }, [applyRunState, multiplayerLobbyCode, multiplayerRequest]);

    const loadRound = useCallback(async (runSessionId: string, roundNumber: number) => {
        if (loadingRound.current) return;
        loadingRound.current = true;
        setRequestedRound(roundNumber);
        setIsLoading(true);
        setError(null);

        try {
            const loaded = multiplayerLobbyCode
                ? await multiplayerRequest<ScorePpRoundLoad>("score_pp.round", {
                      sessionId: runSessionId,
                      round: roundNumber,
                      exclusions: exclusions.current,
                  })
                : await getScorePpRoundAction(runSessionId, roundNumber, exclusions.current);
            if (loaded.terminal) {
                setTerminalRound(true);
                router.replace(loaded.saved ? scoreUrl(runSessionId) : "/");
                return;
            }
            if (!loaded.pair || loaded.deadlineAt === null) {
                setError("unavailable");
                return;
            }
            setResolution(null);
            setSelectedScoreId(null);
            setRevealCountdown(AUTO_ADVANCE_DELAY_MS / 1000);
            setPair(loaded.pair);
            setRound(roundNumber);
            deadline.current = loaded.deadlineAt;
            setTimeLeft(Math.max(0, Math.ceil((loaded.deadlineAt - Date.now()) / 1000)));
        } catch {
            const recovered = await recoverRun(runSessionId);
            setRequestedRound(roundNumber);
            if (!recovered?.terminal && !(recovered?.round === roundNumber && recovered.pair && !recovered.resolution)) setError("load");
        } finally {
            loadingRound.current = false;
            setIsLoading(false);
        }
    }, [multiplayerLobbyCode, multiplayerRequest, recoverRun, router, scoreUrl]);

    const startRun = useCallback(async () => {
        if (starting.current) return;
        starting.current = true;
        exclusions.current = EMPTY_EXCLUSIONS;
        setSessionId(null);
        setPoints(0);
        setStreak(0);
        setMaxStreak(0);
        setMistakes(0);
        setTerminalRound(false);
            setPair(null);
            setError(null);
            setIsLoading(true);
            resolving.current = false;

        try {
            const nextSessionId = multiplayerLobbyCode
                ? await multiplayerRequest<string>("score_pp.start", { variant: gameVariant })
                : await startScorePpRunAction(gameVariant);
            setSessionId(nextSessionId);
            const recovered = await recoverRun(nextSessionId);
            if (!recovered) throw new Error("Could not restore Score PP session");
            if (!recovered.terminal && !recovered.pair) await loadRound(nextSessionId, recovered.round);
            else setIsLoading(false);
        } catch {
            setError("start");
            setIsLoading(false);
        } finally {
            starting.current = false;
        }
    }, [gameVariant, loadRound, multiplayerLobbyCode, multiplayerRequest, recoverRun]);

    useEffect(() => {
        void startRun();
    }, [startRun]);

    const resolveGuess = useCallback(async (scoreId: string | null, submissionType: "guess" | "skip" | "timeout") => {
        if (!sessionId || !pair || resolution || resolving.current) return;
        resolving.current = true;
        setIsSubmitting(true);
        setSelectedScoreId(scoreId);
        setError(null);

        try {
            const result = multiplayerLobbyCode
                ? await multiplayerRequest<ScorePpResolution>("score_pp.submit", {
                      sessionId,
                      pairId: pair.id,
                      selectedScoreId: scoreId,
                      submissionType,
                  })
                : await submitScorePpGuessAction(sessionId, pair.id, scoreId, submissionType);
            applyResolution(result);
        } catch {
            const recovered = await recoverRun(sessionId);
            if (!recovered?.terminal && !recovered?.resolution) {
                setSelectedScoreId(null);
                setError("submit");
            }
        } finally {
            resolving.current = false;
            setIsSubmitting(false);
        }
    }, [applyResolution, multiplayerLobbyCode, multiplayerRequest, pair, recoverRun, resolution, sessionId]);

    useEffect(() => {
        if (!pair || !resolution) return;
        exclusions.current = addPairToExclusions(exclusions.current, pair);
    }, [pair, resolution]);

    useEffect(() => {
        if (!pair || resolution || isLoading) return;

        const updateTimer = () => {
            const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
            setTimeLeft(seconds);
            if (seconds === 0) void resolveGuess(null, "timeout");
        };

        updateTimer();
        const timer = window.setInterval(updateTimer, 250);
        return () => window.clearInterval(timer);
    }, [isLoading, pair, resolution, resolveGuess]);

    const nextRound = useCallback(async () => {
        if (!resolution || !sessionId || isLoading || isSubmitting || navigatingToResults.current) return;
        if (multiplayerLobbyCode) {
            if (!multiplayerRoundState?.allSubmitted) return;
            if (!multiplayerRoundState.ready) {
                sendReady(round);
                return;
            }
            if (!multiplayerRoundState.allReady) return;
        }
        if (terminalRound) {
            navigatingToResults.current = true;
            setIsLoading(true);
            router.replace(scoreUrl(sessionId));
            return;
        }
        await loadRound(sessionId, round + 1);
    }, [isLoading, isSubmitting, loadRound, multiplayerLobbyCode, multiplayerRoundState, resolution, round, router, scoreUrl, sendReady, sessionId, terminalRound]);

    const waitingForGuesses = Boolean(multiplayerLobbyCode && resolution && !multiplayerRoundState?.allSubmitted);
    const waitingForReady = Boolean(multiplayerRoundState?.ready && !multiplayerRoundState.allReady);
    const resultVisible = !multiplayerLobbyCode || Boolean(multiplayerRoundState?.allSubmitted);
    const visibleResolution = resultVisible ? resolution : null;
    const publicStats = waitingForGuesses ? publicStatsRef.current : null;
    const canAdvanceRound = !multiplayerLobbyCode || Boolean(multiplayerRoundState?.allSubmitted);
    const showAdvanceCountdown = Boolean(resolution && canAdvanceRound);
    const participantCount = multiplayerRoundState?.participantCount ?? multiplayerLobby?.players.length ?? 0;
    const waitingLabel = t.game.status.waitingForPlayers
        .replace("{submitted}", String(multiplayerRoundState?.submittedCount ?? 0))
        .replace("{total}", String(participantCount));
    const readyLabel = t.game.status.readyPlayers
        .replace("{ready}", String(multiplayerRoundState?.readyCount ?? 0))
        .replace("{total}", String(participantCount));
    const baseNextRoundLabel = terminalRound ? t.game.actions.viewResults : t.game.actions.nextRoundTime.replace("{seconds}", String(revealCountdown));
    const multiplayerNextRoundLabel = terminalRound ? t.game.actions.viewResults : t.game.actions.nextRound;
    const nextRoundLabel = waitingForGuesses
        ? waitingLabel
        : multiplayerLobbyCode && resolution
          ? `${multiplayerNextRoundLabel} · ${readyLabel}`
          : baseNextRoundLabel;

    useEffect(() => {
        if (!resolution || terminalRound || !multiplayerRoundState?.ready || !multiplayerRoundState.allReady || isLoading || isSubmitting) return;
        void nextRound();
    }, [isLoading, isSubmitting, multiplayerRoundState?.allReady, multiplayerRoundState?.ready, nextRound, resolution, terminalRound]);

    useEffect(() => {
        if (!showAdvanceCountdown || isLoading || isReportDialogOpen || error) return;

        if (multiplayerLobbyCode && sessionId) {
            const key = `${sessionId}:${round}`;
            if (multiplayerAdvanceDeadline.current?.key !== key) {
                multiplayerAdvanceDeadline.current = { key, at: Date.now() + AUTO_ADVANCE_DELAY_MS };
            }

            const updateCountdown = () => {
                const deadlineAt = multiplayerAdvanceDeadline.current?.at ?? Date.now();
                setRevealCountdown(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
            };
            updateCountdown();

            const tick = window.setInterval(updateCountdown, 250);
            const advance = window.setTimeout(() => void nextRound(), Math.max(0, multiplayerAdvanceDeadline.current.at - Date.now()));
            return () => {
                window.clearInterval(tick);
                window.clearTimeout(advance);
            };
        }

        let elapsed = 0;
        let lastTick = performance.now();
        setRevealCountdown(AUTO_ADVANCE_DELAY_MS / 1000);

        const tick = window.setInterval(() => {
            const now = performance.now();
            const delta = now - lastTick;
            lastTick = now;
            if (advancePausedRef.current) return;

            elapsed += delta;
            setRevealCountdown(Math.max(0, Math.ceil((AUTO_ADVANCE_DELAY_MS - elapsed) / 1000)));
            if (elapsed >= AUTO_ADVANCE_DELAY_MS) {
                window.clearInterval(tick);
                void nextRound();
            }
        }, 250);

        return () => window.clearInterval(tick);
    }, [error, isLoading, isReportDialogOpen, multiplayerLobbyCode, nextRound, round, sessionId, showAdvanceCountdown]);

    const skipRound = useCallback(() => {
        void resolveGuess(null, "skip");
    }, [resolveGuess]);

    useGameKeyboardShortcuts({
        disabled: isReportDialogOpen,
        onNextRound: resolution && canAdvanceRound && !waitingForReady ? nextRound : undefined,
        onSkip: pair && !resolution && !isLoading && !isSubmitting ? skipRound : undefined,
    });

    usePreventUnload(gameVariant === "classic" && Boolean(sessionId) && !terminalRound && !(round >= MAX_ROUNDS && resolution));

    const exitConfirmation = gameVariant === "survival" ? t.confirmations.exitGame.death : t.confirmations.exitGame.classic;

    const runExit = useCallback(async (href?: string) => {
        if (!sessionId || isLoading || isSubmitting) return;
        if (terminalRound) {
            if (href) router.push(href);
            else router.replace(scoreUrl(sessionId));
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const runPp = multiplayerLobbyCode ? await multiplayerRequest("score_pp.end", { sessionId }) : await endScorePpRunAction(sessionId);
            if (href) router.push(href);
            else router.replace(runPp === null ? "/" : scoreUrl(sessionId));
        } catch {
            const recovered = await recoverRun(sessionId);
            if (!recovered?.terminal) setError("end");
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, isSubmitting, multiplayerLobbyCode, multiplayerRequest, recoverRun, router, scoreUrl, sessionId, terminalRound]);

    const requestExit = useCallback(() => {
        if (terminalRound && sessionId) {
            router.replace(scoreUrl(sessionId));
            return;
        }
        setExitDialogOpen(true);
    }, [router, scoreUrl, sessionId, terminalRound]);

    const requestRouteLeave = useCallback((href: string) => setPendingLeaveHref(href), []);
    useLeaveGameGuard(Boolean(sessionId && !terminalRound), requestRouteLeave);

    if (!sessionId && error === "start" && !isLoading) {
        return <GameStartError message={t.game.scorePp.errors.start} onRetry={startRun} />;
    }

    return (
        <div className="page-container py-2 lg:py-3 [&>header]:mb-3">
            <GameHeader
                streak={publicStats?.streak ?? streak}
                points={publicStats?.points ?? points}
                timeLeft={showAdvanceCountdown ? revealCountdown : timeLeft}
                currentRound={round}
                totalRounds={MAX_ROUNDS}
                mode={GameMode.ScorePp}
                gameVariant={gameVariant}
                maxStreak={publicStats?.maxStreak ?? maxStreak}
                mistakes={publicStats?.mistakes ?? mistakes}
                lifeCount={SURVIVAL_LIVES}
                timerDuration={showAdvanceCountdown ? AUTO_ADVANCE_DELAY_MS / 1000 : ROUND_TIME}
            />
            {multiplayerLobby && (
                <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                    <MultiplayerChat lobby={multiplayerLobby} sendMessage={sendChat} />
                    <MultiplayerStandings
                        lobby={multiplayerLobby}
                        presenceUserIds={presenceUserIds}
                        currentUserId={multiplayerUserId}
                        currentRound={round}
                    />
                </div>
            )}

            {error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="size-4" />
                    <AlertTitle>{t.game.scorePp.unavailable}</AlertTitle>
                    <AlertDescription className="mt-2 flex flex-wrap items-center gap-3">
                        <span>{t.game.scorePp.errors[error]}</span>
                        {sessionId && <Button size="sm" variant="outline" onClick={() => void loadRound(sessionId, requestedRound)}>{t.game.actions.retry}</Button>}
                    </AlertDescription>
                </Alert>
            )}
            {multiplayerError && !error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="size-4" />
                    <AlertTitle>{t.game.scorePp.unavailable}</AlertTitle>
                    <AlertDescription>{multiplayerError}</AlertDescription>
                </Alert>
            )}

            <div className="mb-3">
                <h2 className="text-base font-semibold tracking-tight sm:text-lg">{t.game.scorePp.question}</h2>
            </div>

            {pair ? (
                <div className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]" onMouseEnter={() => { advancePausedRef.current = true; }} onMouseLeave={() => { advancePausedRef.current = false; }} onFocusCapture={() => { advancePausedRef.current = true; }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) advancePausedRef.current = false; }}>
                    <ScorePpCard
                        key={`${pair.id}-${pair.left.sourceScoreId}`}
                        score={pair.left}
                        side="A"
                        pp={scorePp(visibleResolution, pair.left)}
                        isHigher={visibleResolution?.higherScoreId === pair.left.sourceScoreId}
                        selected={selectedScoreId === pair.left.sourceScoreId}
                        revealed={Boolean(visibleResolution)}
                        disabled={Boolean(resolution) || isLoading || isSubmitting}
                        onChoose={() => void resolveGuess(pair.left.sourceScoreId, "guess")}
                    />
                    <div className="flex items-center gap-3 py-1 text-xs font-bold text-muted-foreground lg:flex-col lg:py-0">
                        <div className="h-px flex-1 bg-border/60 lg:h-auto lg:w-px" />
                        <span className="shrink-0 px-1 text-sm">VS</span>
                        <div className="h-px flex-1 bg-border/60 lg:h-auto lg:w-px" />
                    </div>
                    <ScorePpCard
                        key={`${pair.id}-${pair.right.sourceScoreId}`}
                        score={pair.right}
                        side="B"
                        pp={scorePp(visibleResolution, pair.right)}
                        isHigher={visibleResolution?.higherScoreId === pair.right.sourceScoreId}
                        selected={selectedScoreId === pair.right.sourceScoreId}
                        revealed={Boolean(visibleResolution)}
                        disabled={Boolean(resolution) || isLoading || isSubmitting}
                        onChoose={() => void resolveGuess(pair.right.sourceScoreId, "guess")}
                    />
                </div>
            ) : !error ? (
                <div className="flex min-h-80 items-center justify-center border border-border/50 bg-muted/20 text-sm text-muted-foreground">{t.game.scorePp.loading}</div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 items-center gap-3 border-t border-border/60 pt-4 sm:grid-cols-[1fr_auto_1fr]">
                <GameActionButton className="w-full sm:w-auto sm:justify-self-start" intent="exit" onClick={requestExit} disabled={isLoading || isSubmitting}>
                    {gameVariant === "survival" ? t.game.actions.endRun : t.game.actions.exitGame}
                </GameActionButton>
                {visibleResolution ? (
                    <div className={`col-span-2 row-start-1 text-center text-sm sm:col-span-1 sm:col-start-2 ${visibleResolution.resultType === "skip" ? "text-warning" : "text-muted-foreground"}`} role="status" aria-live="polite">
                        {visibleResolution.resultType === "skip"
                            ? t.game.result.skipped
                            : visibleResolution.resultType === "timeout"
                              ? t.game.scorePp.timeUp
                              : visibleResolution.correct
                                ? t.game.scorePp.correct
                                : t.game.scorePp.wrong}
                    </div>
                ) : (
                    <span className="hidden sm:block" aria-hidden="true" />
                )}
                {resolution && (
                    <GameActionButton loadingLabel={isLoading ? t.game.status.loading : undefined} className="w-full sm:col-start-3 sm:row-start-1 sm:w-auto sm:min-w-44 sm:justify-self-end" onClick={() => void nextRound()} disabled={isLoading || isSubmitting || waitingForGuesses || waitingForReady}>
                        {nextRoundLabel}
                    </GameActionButton>
                )}
                {!resolution && pair && (
                    <GameActionButton intent="skip" className="w-full sm:w-auto sm:min-w-44 sm:justify-self-end" onClick={() => void resolveGuess(null, "skip")} disabled={isLoading || isSubmitting}>
                        {gameVariant === "survival" ? t.game.input.skipDeath : t.game.input.skip}
                    </GameActionButton>
                )}
            </div>

            <div className="flex items-start justify-between gap-3">
                <GameShortcuts />
                {visibleResolution && pair && (
                    <div className="pt-3">
                    <ReportDialog
                        mapsetId={pair.left.beatmap.beatmapsetId}
                        mapsetTitle={`${pair.left.beatmap.artist} - ${pair.left.beatmap.title}`}
                        alternatives={[
                            {
                                mapsetId: pair.right.beatmap.beatmapsetId,
                                mapsetTitle: `${pair.right.beatmap.artist} - ${pair.right.beatmap.title}`,
                            },
                        ]}
                        onOpenChange={setIsReportDialogOpen}
                    />
                    </div>
                )}
            </div>

            <LeaveGameDialog
                open={exitDialogOpen || pendingLeaveHref !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setExitDialogOpen(false);
                        setPendingLeaveHref(null);
                    }
                }}
                title={t.confirmations.exitGame.title}
                description={exitConfirmation}
                confirmLabel={t.confirmations.exitGame.confirm}
                cancelLabel={t.common.cancel}
                onConfirm={() => void runExit(pendingLeaveHref ?? undefined)}
                disabled={isLoading || isSubmitting}
            />
        </div>
    );
}
