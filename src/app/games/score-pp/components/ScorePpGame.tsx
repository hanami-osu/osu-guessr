"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslationsContext } from "@/context/translations-provider";
import { GameMode, type GameVariant } from "@/actions/types";
import { endScorePpRunAction, getScorePpRoundAction, getScorePpRunStateAction, startScorePpRunAction, submitScorePpGuessAction } from "@/actions/score-pp-server";
import type { ScorePpPublicPair, ScorePpPublicScore, ScorePpResolution, ScorePpRunState } from "@/lib/score-pp/types";
import { AdSlider } from "@/components/Ads";
import { ReportDialog } from "@/components/ReportDialog";
import GameActionButton from "../../shared/components/GameActionButton";
import GameShortcuts from "../../shared/components/GameShortcuts";
import GameStartError from "../../shared/components/GameStartError";
import { useGameKeyboardShortcuts } from "../../shared/hooks/useGameKeyboardShortcuts";
import { usePreventUnload } from "../../shared/hooks/usePreventUnload";
import GameHeader from "../../shared/components/Header";
import { AUTO_ADVANCE_DELAY_MS, MAX_ROUNDS, ROUND_TIME, SURVIVAL_LIVES } from "../../config";
import ScorePpCard from "./ScorePpCard";

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

export default function ScorePpGame({ gameVariant }: { gameVariant: GameVariant }) {
    const router = useRouter();
    const { t } = useTranslationsContext();
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
    const [terminalRound, setTerminalRound] = useState(false);
    const [error, setError] = useState<ScorePpError | null>(null);
    const exclusions = useRef<Exclusions>(EMPTY_EXCLUSIONS);
    const deadline = useRef(0);
    const resolving = useRef(false);
    const starting = useRef(false);
    const loadingRound = useRef(false);

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
            router.replace(state.saved ? `/scores/${runSessionId}` : "/");
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
    }, [applyResolution, router]);

    const recoverRun = useCallback(async (runSessionId: string): Promise<ScorePpRunState | null> => {
        try {
            const state = await getScorePpRunStateAction(runSessionId);
            applyRunState(state, runSessionId);
            return state;
        } catch {
            return null;
        }
    }, [applyRunState]);

    const loadRound = useCallback(async (runSessionId: string, roundNumber: number) => {
        if (loadingRound.current) return;
        loadingRound.current = true;
        setRequestedRound(roundNumber);
        setIsLoading(true);
        setError(null);

        try {
            const loaded = await getScorePpRoundAction(runSessionId, roundNumber, exclusions.current);
            if (loaded.terminal) {
                setTerminalRound(true);
                router.replace(loaded.saved ? `/scores/${runSessionId}` : "/");
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
    }, [recoverRun, router]);

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
            const nextSessionId = await startScorePpRunAction(gameVariant);
            setSessionId(nextSessionId);
            await loadRound(nextSessionId, 1);
        } catch {
            setError("start");
            setIsLoading(false);
        } finally {
            starting.current = false;
        }
    }, [gameVariant, loadRound]);

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
            const result = await submitScorePpGuessAction(sessionId, pair.id, scoreId, submissionType);
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
    }, [applyResolution, pair, recoverRun, resolution, sessionId]);

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
        if (!resolution || !sessionId || isLoading || isSubmitting) return;
        if (terminalRound) {
            router.replace(`/scores/${sessionId}`);
            return;
        }
        await loadRound(sessionId, round + 1);
    }, [isLoading, isSubmitting, loadRound, resolution, round, router, sessionId, terminalRound]);

    useEffect(() => {
        if (!resolution || isLoading || isReportDialogOpen || error) return;
        const tick = window.setInterval(() => setRevealCountdown((value) => Math.max(0, value - 1)), 1000);
        const advance = window.setTimeout(() => void nextRound(), AUTO_ADVANCE_DELAY_MS);
        return () => {
            window.clearInterval(tick);
            window.clearTimeout(advance);
        };
    }, [error, isLoading, isReportDialogOpen, nextRound, resolution]);

    const skipRound = useCallback(() => {
        void resolveGuess(null, "skip");
    }, [resolveGuess]);

    useGameKeyboardShortcuts({
        disabled: isReportDialogOpen,
        onNextRound: resolution ? nextRound : undefined,
        onSkip: pair && !resolution && !isLoading && !isSubmitting ? skipRound : undefined,
    });

    usePreventUnload(gameVariant === "classic" && Boolean(sessionId) && !terminalRound && !(round >= MAX_ROUNDS && resolution));

    const handleExit = useCallback(async () => {
        if (!sessionId || isLoading || isSubmitting) return;
        if (terminalRound) {
            router.replace(`/scores/${sessionId}`);
            return;
        }

        const confirmation = gameVariant === "survival" ? t.confirmations.exitGame.death : t.confirmations.exitGame.classic;
        if (!window.confirm(confirmation)) return;

        setIsLoading(true);
        setError(null);
        try {
            const runPp = await endScorePpRunAction(sessionId);
            router.replace(runPp === null ? "/" : `/scores/${sessionId}`);
        } catch {
            const recovered = await recoverRun(sessionId);
            if (!recovered?.terminal) setError("end");
        } finally {
            setIsLoading(false);
        }
    }, [gameVariant, isLoading, isSubmitting, recoverRun, router, sessionId, t.confirmations.exitGame.classic, t.confirmations.exitGame.death, terminalRound]);

    if (!sessionId && error === "start" && !isLoading) {
        return <GameStartError message={t.game.scorePp.errors.start} onRetry={startRun} />;
    }

    return (
        <div className="page-container py-2 lg:py-3 [&>header]:mb-3">
            <GameHeader
                streak={streak}
                points={points}
                timeLeft={resolution ? revealCountdown : timeLeft}
                currentRound={round}
                totalRounds={MAX_ROUNDS}
                mode={GameMode.ScorePp}
                gameVariant={gameVariant}
                maxStreak={maxStreak}
                mistakes={mistakes}
                lifeCount={SURVIVAL_LIVES}
                timerDuration={resolution ? AUTO_ADVANCE_DELAY_MS / 1000 : ROUND_TIME}
            />

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

            <div className="mb-3">
                <h2 className="text-base font-semibold tracking-tight sm:text-lg">{t.game.scorePp.question}</h2>
            </div>

            {pair ? (
                <div className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)]">
                    <ScorePpCard
                        key={`${pair.id}-${pair.left.sourceScoreId}`}
                        score={pair.left}
                        side="A"
                        pp={scorePp(resolution, pair.left)}
                        isHigher={resolution?.higherScoreId === pair.left.sourceScoreId}
                        selected={selectedScoreId === pair.left.sourceScoreId}
                        revealed={Boolean(resolution)}
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
                        pp={scorePp(resolution, pair.right)}
                        isHigher={resolution?.higherScoreId === pair.right.sourceScoreId}
                        selected={selectedScoreId === pair.right.sourceScoreId}
                        revealed={Boolean(resolution)}
                        disabled={Boolean(resolution) || isLoading || isSubmitting}
                        onChoose={() => void resolveGuess(pair.right.sourceScoreId, "guess")}
                    />
                </div>
            ) : !error ? (
                <div className="flex min-h-80 items-center justify-center border border-border/50 bg-muted/20 text-sm text-muted-foreground">{t.game.scorePp.loading}</div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 items-center gap-3 border-t border-border/60 pt-4 sm:grid-cols-[1fr_auto_1fr]">
                <GameActionButton className="w-full sm:w-auto sm:justify-self-start" intent="exit" onClick={() => void handleExit()} disabled={isLoading || isSubmitting}>
                    {gameVariant === "survival" ? t.game.actions.endRun : t.game.actions.exitGame}
                </GameActionButton>
                {resolution ? (
                    <div className={`col-span-2 row-start-1 text-center text-sm sm:col-span-1 sm:col-start-2 ${resolution.resultType === "skip" ? "text-warning" : "text-muted-foreground"}`} role="status" aria-live="polite">
                        {resolution.resultType === "skip"
                            ? t.game.result.skipped
                            : resolution.resultType === "timeout"
                              ? t.game.scorePp.timeUp
                              : resolution.correct
                                ? t.game.scorePp.correct
                                : t.game.scorePp.wrong}
                    </div>
                ) : (
                    <span className="hidden sm:block" aria-hidden="true" />
                )}
                {resolution && (
                    <GameActionButton loadingLabel={isLoading ? t.game.status.loading : undefined} className="w-full sm:col-start-3 sm:row-start-1 sm:w-auto sm:min-w-44 sm:justify-self-end" onClick={() => void nextRound()} disabled={isLoading || isSubmitting}>
                        {terminalRound ? t.game.actions.viewResults : t.game.actions.nextRoundTime.replace("{seconds}", String(revealCountdown))}
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
                {resolution && pair && (
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

            <AdSlider compact />
        </div>
    );
}
