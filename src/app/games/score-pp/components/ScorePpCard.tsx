"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { useTranslationsContext } from "@/context/translations-provider";
import type { ScorePpPublicScore } from "@/lib/score-pp/types";

interface ScorePpCardProps {
    score: ScorePpPublicScore;
    side: "A" | "B";
    pp?: number;
    isHigher?: boolean;
    selected?: boolean;
    revealed: boolean;
    disabled: boolean;
    onChoose(): void;
}

export default function ScorePpCard({ score, side, pp, isHigher, selected, revealed, disabled, onChoose }: ScorePpCardProps) {
    const { t } = useTranslationsContext();
    const rankLabel = score.player.globalRank ? `#${score.player.globalRank.toLocaleString()}` : t.game.scorePp.unranked;
    const resultClass = revealed
        ? isHigher
            ? "border-success/80 bg-success/[0.055]"
            : selected
              ? "border-destructive/75 bg-destructive/[0.025] opacity-65"
              : "border-border/40 opacity-50"
        : disabled
          ? "border-border/40 opacity-60"
          : "border-border/60 hover:border-primary/50 hover:bg-muted/[0.08]";

    return (
        <article className={`${disabled ? "" : "group"} relative isolate min-w-0 border transition-[border-color,background-color,opacity] duration-200 ${resultClass}`} aria-busy={disabled && !revealed ? true : undefined}>
            <div className="flex h-11 items-center justify-between gap-3 px-3 lg:h-14 lg:px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted">
                        <Image src={score.player.avatarUrl || "/default-avatar.svg"} alt="" fill unoptimized sizes="32px" className="object-cover" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground sm:text-base">{score.player.username}</div>
                        <div className="text-xs text-muted-foreground">{t.game.scorePp.globalRank} <span className="font-medium tabular-nums text-foreground/80">{rankLabel}</span></div>
                    </div>
                </div>

                {revealed && pp !== undefined && (
                    <div className={`shrink-0 text-right font-mono text-2xl font-bold tabular-nums sm:text-3xl ${isHigher ? "text-success" : selected ? "text-destructive" : "text-muted-foreground"}`}>
                        {pp.toFixed(2)}pp
                    </div>
                )}
            </div>

            <div className="relative h-[clamp(5.5rem,14svh,7rem)] overflow-hidden bg-muted lg:h-[clamp(7rem,calc(100svh-38rem),18rem)]">
                <Image
                    src={score.beatmap.backgroundUrl}
                    alt=""
                    fill
                    priority
                    sizes="(min-width: 1024px) 42vw, 100vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.01] motion-reduce:transition-none"
                />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-black/10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 lg:p-4">
                    <div className="mb-1 inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 rounded-sm bg-black/45 px-2 py-0.5 font-mono text-lg font-bold text-white backdrop-blur-sm">
                        {(score.mods.length ? score.mods : ["NM"]).map((mod) => (
                            <span key={mod}>{mod}</span>
                        ))}
                    </div>
                    <h2 className="truncate text-base font-semibold tracking-tight text-white drop-shadow-sm sm:text-lg">
                        {score.beatmap.artist} - {score.beatmap.title}
                    </h2>
                    <div className="mt-1 flex min-w-0 items-center gap-x-1 text-xs text-white/75 sm:text-sm">
                        <span className="min-w-0 truncate">[{score.beatmap.difficultyName}]</span>
                        <span className="shrink-0">· {score.beatmap.starRating.toFixed(2)}★ ·</span>
                        <a
                            href={score.beatmap.beatmapUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="pointer-events-auto inline-flex shrink-0 items-center gap-1 font-medium text-white/80 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            onClick={(event) => event.stopPropagation()}
                        >
                            {t.game.scorePp.beatmap}
                            <ExternalLink aria-hidden="true" className="size-3" />
                        </a>
                    </div>
                </div>
            </div>

            <dl className="grid grid-cols-[1fr_1.5fr_0.6fr] gap-2 border-t border-border/40 px-3 py-2 lg:gap-4 lg:px-4 lg:py-3">
                <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.game.scorePp.accuracy}</dt>
                    <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums lg:text-2xl">{(score.accuracy * 100).toFixed(2)}%</dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.game.scorePp.combo}</dt>
                    <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums lg:text-2xl">{score.maxCombo.toLocaleString()}<span className="text-sm font-medium">x</span><span className="text-sm font-medium tracking-normal text-muted-foreground">/{score.beatmap.maxCombo?.toLocaleString() ?? "?"}x</span></dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t.game.scorePp.miss}</dt>
                    <dd className={`mt-1 text-xl font-semibold tracking-tight tabular-nums lg:text-2xl ${score.statistics.miss > 0 ? "text-destructive" : "text-foreground"}`}>{score.statistics.miss.toLocaleString()}</dd>
                </div>
            </dl>

            <button
                type="button"
                aria-label={t.game.scorePp.chooseScore.replace("{side}", side)}
                aria-pressed={selected || undefined}
                onClick={onChoose}
                disabled={disabled}
                className="absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:pointer-events-none"
            >
                <span className="sr-only">{t.game.scorePp.chooseScore.replace("{side}", side)}</span>
            </button>
        </article>
    );
}
