"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslationsContext } from "@/context/translations-provider";
import DailyResetCountdown from "@/app/games/shared/components/DailyResetCountdown";
import { formatDailyShareResult, type DailyOutcome } from "@/lib/game/daily";

interface DailyScoreSummaryProps {
    gameMode: string;
    day: number;
    points: number;
    debugUnlimitedAttempts: boolean;
    outcomes: Array<{ correct: boolean; resultType: string }>;
    responseTimeMs: number;
    scoreId?: string;
}

function outcomeColor(outcome: DailyScoreSummaryProps["outcomes"][number]): string {
    if (outcome.correct) return "bg-emerald-500";
    if (outcome.resultType === "guess") return "bg-destructive";
    return outcome.resultType === "skip" ? "bg-orange-500" : "bg-zinc-600";
}

export default function DailyScoreSummary({ gameMode, day, points, responseTimeMs, outcomes, debugUnlimitedAttempts, scoreId }: DailyScoreSummaryProps) {
    const { t } = useTranslationsContext();
    const [copied, setCopied] = useState(false);
    const modeLabel = gameMode === "score_pp" ? "Score pp" : gameMode.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const displayTitle = `osu!guessr daily ${modeLabel.toLowerCase()} #${day}`;

    async function copyResults() {
        const resultText = formatDailyShareResult(
            gameMode,
            day,
            outcomes.filter(({ correct }) => correct).length,
            points,
            responseTimeMs,
            outcomes.map(({ correct, resultType }) => (correct ? "correct" : resultType === "guess" ? "incorrect" : resultType)) as DailyOutcome[],
            `${window.location.origin}${scoreId ? `/scores/${scoreId}` : "/?daily=true"}`,
        );

        try {
            await navigator.clipboard.writeText(resultText);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Failed to copy daily results:", error);
        }
    }

    return (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-border/60 py-4" aria-label={displayTitle}>
            <div>
            <h2 className="text-sm font-semibold text-foreground">{displayTitle}</h2>
                <div className="mt-2 flex items-center gap-2" aria-label={t.game.daily.share.results}>
                    {Array.from({ length: 5 }, (_, index) => {
                        const outcome = outcomes[index] ?? { correct: false, resultType: "timeout" };
                        return <span key={index} aria-label={`${t.game.daily.share.round} ${index + 1}`} className={`size-3 rounded-full ${outcomeColor(outcome)}`} />;
                    })}
                </div>
                <div className="mt-2"><DailyResetCountdown /></div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyResults}>
                    {copied ? <Check className="mr-2 size-4" aria-hidden="true" /> : <Copy className="mr-2 size-4" aria-hidden="true" />}
                    {copied ? t.game.daily.share.copied : t.game.daily.share.copy}
                </Button>
                {debugUnlimitedAttempts && (
                    <Button asChild size="sm">
                        <Link href={`/games/${gameMode}?variant=classic&run=daily`}>{t.game.stats.actions.tryAgain}</Link>
                    </Button>
                )}
            </div>
        </section>
    );
}