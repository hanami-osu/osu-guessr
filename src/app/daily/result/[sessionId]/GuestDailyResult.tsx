"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { claimGuestDailyResultAction } from "@/actions/game-server";
import { shouldAutoClaimGuestDailyResult } from "@/lib/game/daily-client";
import { useTranslationsContext } from "@/context/translations-provider";
import DailyScoreSummary from "@/app/scores/DailyScoreSummary";
import ScoreResultCard from "@/app/scores/ScoreResultCard";

interface GuestDailyResultData {
    sessionId: string;
    gameMode: string;
    day: number;
    points: number;
    correct: number;
    highestStreak: number;
    totalResponseTimeMs: number;
    endedAt: string;
    outcomes: Array<{ correct: boolean; resultType: string; answer: string; guess: string | null }>;
}

export default function GuestDailyResult({ result }: { result: GuestDailyResultData }) {
    const { data: session, status: sessionStatus } = useSession();
    const { t, locale } = useTranslationsContext();
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const claimStarted = useRef(false);
    const correctCount = result.correct;
    const roundsPlayed = result.outcomes.length;
    const accuracy = roundsPlayed > 0 ? (correctCount / roundsPlayed) * 100 : 0;
    const averageResponseSeconds = roundsPlayed > 0 ? result.totalResponseTimeMs / roundsPlayed / 1000 : 0;
    const modeLabel = t.game.preGame.title[result.gameMode as keyof typeof t.game.preGame.title] ?? result.gameMode;

    const saveResults = useCallback(async () => {
        if (!session?.user?.banchoId) {
            const returnUrl = new URL(window.location.href);
            returnUrl.searchParams.set("save", "1");
            await signIn("hanami", { redirectTo: returnUrl.toString() });
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const claimedSessionId = await claimGuestDailyResultAction(result.sessionId);
            router.replace(`/scores/${claimedSessionId}`);
        } catch (claimError) {
            setError(claimError instanceof Error && claimError.message.includes("DAILY_CHALLENGE_ALREADY_PLAYED") ? t.game.daily.claimAlreadyPlayed : t.game.daily.claimFailed);
        } finally {
            setSaving(false);
        }
    }, [result.sessionId, router, session?.user?.banchoId, t.game.daily.claimAlreadyPlayed, t.game.daily.claimFailed]);

    useEffect(() => {
        const saveRequested = new URLSearchParams(window.location.search).get("save") === "1";
        if (!shouldAutoClaimGuestDailyResult(sessionStatus, Boolean(session?.user?.banchoId), saveRequested) || claimStarted.current) return;
        claimStarted.current = true;
        void saveResults();
    }, [session?.user?.banchoId, sessionStatus, saveResults]);

    return (
        <main className="page-container py-6 md:py-10">
            <ScoreResultCard
                subtitle={
                    <>
                        {modeLabel} · {t.game.preGame.modes.daily.title} · {new Date(result.endedAt).toLocaleString(locale)}
                    </>
                }
                title="Your score"
                pointsLabel={t.game.stats.classic.totalPoints}
                points={result.points.toLocaleString(locale)}
                statsClassName="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0"
                stats={[
                    { label: "Total Points", value: result.points.toLocaleString() },
                    { label: "Correct", value: `${correctCount}/${roundsPlayed}` },
                    { label: "Accuracy", value: `${accuracy.toFixed(1)}%` },
                    { label: "Best Streak", value: `${result.highestStreak}x` },
                    { label: "Avg. Response", value: `${averageResponseSeconds.toFixed(1)}s` },
                ]}
            />
            <DailyScoreSummary
                gameMode={result.gameMode}
                day={result.day}
                points={result.points}
                responseTimeMs={result.totalResponseTimeMs}
                outcomes={result.outcomes.map(({ correct, resultType }) => ({ correct, resultType }))}
                debugUnlimitedAttempts={false}
            />
            {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
            <section className="mb-5 divide-y divide-border/60 border-y border-border/60" aria-label={t.game.daily.share.results}>
                {result.outcomes.map((outcome, index) => {
                    const guessText = outcome.guess ?? (() => {
                        if (outcome.resultType === "guess") return "Guess";
                        if (outcome.resultType === "skip") return "Skip";
                        if (outcome.resultType === "timeout") return "Timeout";
                        return "No guess";
                    })();

                    return (
                        <div key={`${index}-${outcome.answer}`} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 py-3 text-sm">
                            <span className="text-muted-foreground">{index + 1}</span>
                            <span className="min-w-0 break-words font-medium">{outcome.answer}</span>
                            <span className="min-w-0 break-words text-muted-foreground">{guessText}</span>
                        </div>
                    );
                })}
            </section>
            <Button type="button" onClick={saveResults} disabled={saving || sessionStatus === "loading"}>
                {sessionStatus === "loading" || saving ? t.common.loading : session?.user?.banchoId ? t.game.daily.saveResults : t.game.daily.signInToSave}
            </Button>
        </main>
    );
}
