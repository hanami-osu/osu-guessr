import type { ReactNode } from "react";

export interface ScoreResultStat {
    label: string;
    value: string;
}

interface ScoreResultCardProps {
    title: ReactNode;
    subtitle: ReactNode;
    pointsLabel: string;
    points: string;
    highlightedPoints?: boolean;
    stats: ScoreResultStat[];
    statsClassName: string;
}

export default function ScoreResultCard({ title, subtitle, pointsLabel, points, highlightedPoints = false, stats, statsClassName }: ScoreResultCardProps) {
    return (
        <section className="overflow-hidden rounded-lg border border-border bg-card/60">
            <div className="border-b border-border/60 px-5 py-5 sm:px-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-sm text-muted-foreground">{subtitle}</div>
                        <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                    </div>
                    <div className="text-right">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">{pointsLabel}</div>
                        <div className={`mt-1 text-3xl font-bold tabular-nums ${highlightedPoints ? "text-primary" : "text-muted-foreground"}`}>{points}</div>
                    </div>
                </div>
            </div>
            <dl className={statsClassName}>
                {stats.map(({ label, value }) => (
                    <div key={label} className="px-4 py-4 sm:px-5">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}