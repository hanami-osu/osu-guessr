"use client";

import { Game, GameMode, UserLifetimeModeStats, UserRankHistoryPoint, UserWithStats } from "@/actions/types";
import { GameVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import { ArrowUpRight, ChevronDown, ChevronRight, Clock3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import UserNotFound from "./NotFound";

const gamemodes = [GameMode.Background, GameMode.Audio, GameMode.Skin];

interface UserProfileClientProps {
    currentMode: GameMode;
    currentVariant: GameVariant;
    banchoId: string;
    user?: UserWithStats | null;
    lifetimeModeStats?: UserLifetimeModeStats;
    bestScores?: Game[];
    recentScores?: Game[];
    rankHistory?: UserRankHistoryPoint[];
    generatedAt?: string;
    loadError?: string | null;
}

export default function UserProfileClient({
    currentMode,
    currentVariant,
    banchoId,
    user = null,
    lifetimeModeStats,
    bestScores = [],
    recentScores = [],
    rankHistory = [],
    generatedAt = new Date().toISOString(),
    loadError = null,
}: UserProfileClientProps) {
    const { t, locale } = useTranslationsContext();

    if (loadError) {
        return (
            <div className="page-container py-12">
                <h1 className="text-2xl font-semibold">{t.user.profile.loadFailed}</h1>
                <p className="mt-3 text-muted-foreground">{loadError}</p>
                <Link href="/" className="mt-5 inline-block text-primary hover:underline">
                    {t.user.notFound.actions.home}
                </Link>
            </div>
        );
    }

    if (!user) return <UserNotFound />;

    const achievements = (user.achievements ?? []).filter((stat) => stat.variant === currentVariant);
    const modeStats = achievements.find((stat) => stat.game_mode === currentMode);
    const modePp = Number(modeStats?.profile_pp ?? 0);
    const activeTimeMs = modeStats?.total_response_time_ms ?? 0n;
    const totalGuesses = Math.max(0, (modeStats?.rounds_played ?? 0) - (modeStats?.total_skips ?? 0) - (modeStats?.total_timeouts ?? 0));
    const guessAccuracy = totalGuesses > 0 ? ((modeStats?.total_correct ?? 0) / totalGuesses) * 100 : 0;
    const lifetime = lifetimeModeStats ?? {
        games_played: modeStats?.games_played ?? 0,
        total_score: modeStats?.total_score ?? 0n,
        highest_score: modeStats?.highest_score ?? 0,
        highest_streak: modeStats?.highest_streak ?? 0,
        average_streak: 0,
        last_played: modeStats?.last_played ?? null,
    };
    const formatRank = (rank?: number) => (rank ? `#${rank.toLocaleString(locale)}` : "-");

    return (
        <main className="page-container pb-5 pt-3 md:pb-8 md:pt-4">
            <div className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 bg-muted/35 p-2.5 sm:gap-3 sm:px-4">
                    <nav aria-label={t.user.profile.modeLabel} className="flex flex-wrap items-center gap-1.5">
                        {gamemodes.map((mode) => (
                            <Link
                                key={mode}
                                href={`/user/${banchoId}?mode=${mode}&variant=${currentVariant}`}
                                scroll={false}
                                aria-current={currentMode === mode ? "page" : undefined}
                                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${currentMode === mode ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            >
                                {t.leaderboard.filters.mode[mode]}
                            </Link>
                        ))}
                    </nav>

                    <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-border sm:block" />

                    <nav aria-label={t.user.profile.variantLabel} className="flex flex-wrap items-center gap-1.5">
                        {(["classic", "survival"] as const).map((variant) => (
                            <Link
                                key={variant}
                                href={`/user/${banchoId}?mode=${currentMode}&variant=${variant}`}
                                scroll={false}
                                aria-current={currentVariant === variant ? "page" : undefined}
                                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${currentVariant === variant ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            >
                                {t.leaderboard.filters.variant[variant]}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="relative h-40 overflow-hidden sm:h-48 md:h-56">
                    <Image
                        src={user.banner_url || "/main_bg.webp"}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 1152px, 100vw"
                        priority
                        unoptimized={Boolean(user.banner_url)}
                        loader={user.banner_url ? ({ src }) => src : undefined}
                        referrerPolicy="no-referrer"
                        className={`object-cover ${user.banner_url ? "object-center" : "object-[50%_32%]"}`}
                    />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                </div>

                <div className="relative px-5 pb-5 sm:px-7 sm:pb-6 md:px-9">
                    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_1px_minmax(320px,0.9fr)] lg:gap-9">
                        <section className="min-w-0">
                            <div className="-mt-12 translate-y-2 flex min-w-0 items-end gap-4 sm:-mt-14 sm:gap-5">
                                <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-lg sm:size-28">
                                    <Image src={user.avatar_url} alt="" fill sizes="(min-width: 640px) 112px, 96px" priority unoptimized className="object-cover" />
                                </div>

                                <div className="min-w-0 pb-1.5">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                        <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">{user.username}</h1>
                                        <Link
                                            href={`https://osu.ppy.sh/users/${banchoId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                                        >
                                            {t.user.profile.viewOsuProfile}
                                            <ArrowUpRight aria-hidden="true" className="size-3.5" />
                                        </Link>
                                    </div>

                                    {user.badges.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                            {user.badges.map((badge, index) => (
                                                <span key={`${badge.name}-${index}`} className="text-sm font-medium" style={{ color: badge.color }}>
                                                    {badge.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-8">
                                <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-3 sm:divide-x sm:divide-border/60">
                                    <SummaryMetric label={t.user.profile.stats.globalRank} value={formatRank(user.ranks?.modeRanks[currentMode]?.[currentVariant])} />
                                    <SummaryMetric label={t.user.profile.gameStats.profilePp} value={`${modePp.toLocaleString(locale, { maximumFractionDigits: 1 })} pp`} />
                                    <SummaryMetric label={t.user.profile.stats.playtime} value={formatDuration(activeTimeMs, locale)} />
                                </dl>
                            </div>

                            <RankHistory title={t.user.profile.stats.rankHistory} points={rankHistory} locale={locale} />
                        </section>

                        <div aria-hidden="true" className="hidden bg-border/70 lg:block" />

                        <section aria-label={t.user.profile.gameStats.title} className="mt-4">
                            <div className="flex h-full items-center rounded-xl bg-muted/45 p-4 sm:p-5">
                                <dl className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 text-sm">
                                    <DetailMetric label={t.user.profile.gameStats.guessAccuracy} value={`${guessAccuracy.toLocaleString(locale, { maximumFractionDigits: 1 })}%`} />
                                    <DetailMetric label={t.user.profile.gameStats.gamesPlayed} value={lifetime.games_played.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.totalScore} value={lifetime.total_score.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.totalGuesses} value={totalGuesses.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.bestStreak} value={lifetime.highest_streak.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.averageCombo} value={lifetime.average_streak.toLocaleString(locale, { maximumFractionDigits: 1 })} />
                                </dl>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <div className="mt-6 rounded-2xl bg-card/70 p-4 shadow-sm sm:p-5">
                <ScoreSection
                    title={t.user.profile.topGames.title}
                    emptyText={t.user.profile.topGames.empty}
                    games={bestScores}
                    kind="top"
                    variant={currentVariant}
                    locale={locale}
                    pointsTemplate={t.user.profile.topGames.points}
                    streakTemplate={t.user.profile.topGames.streak}
                    ppTemplate={t.user.profile.topGames.pp}
                    showMoreText={t.user.profile.showMore}
                />
                <div aria-hidden="true" className="my-6 h-px bg-border/60" />
                <ScoreSection
                    title={`${t.user.profile.recentGames.title} (24h)`}
                    emptyText={t.user.profile.recentGames.noGames}
                    games={recentScores}
                    kind="recent"
                    variant={currentVariant}
                    locale={locale}
                    pointsTemplate={t.user.profile.topGames.points}
                    streakTemplate={t.user.profile.topGames.streak}
                    ppTemplate={t.user.profile.topGames.pp}
                    showMoreText={t.user.profile.showMore}
                    relativeDates
                    generatedAt={generatedAt}
                />
            </div>
        </main>
    );
}

interface ScoreSectionProps {
    title: string;
    emptyText: string;
    games: Game[];
    kind: "top" | "recent";
    variant: GameVariant;
    locale: string;
    pointsTemplate: string;
    streakTemplate: string;
    ppTemplate: string;
    showMoreText: string;
    relativeDates?: boolean;
    generatedAt?: string;
}

function ScoreSection({ title, emptyText, games, kind, variant, locale, pointsTemplate, streakTemplate, ppTemplate, showMoreText, relativeDates = false, generatedAt }: ScoreSectionProps) {
    const [expanded, setExpanded] = useState(false);
    const visibleGames = expanded ? games : games.slice(0, 5);
    const isTopSection = kind === "top";

    return (
        <section aria-label={title}>
            <div className="mb-3 flex items-center gap-2 px-1">
                <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />
                <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{games.length.toLocaleString(locale)}</span>
            </div>

            {games.length > 0 ? (
                <>
                    <div className="space-y-1.5">
                        {visibleGames.map((game, index) => {
                            const endedAt = new Date(game.ended_at);
                            const isLegacyDeath = variant === "survival" && game.variant === "death" && game.ruleset_version === 0 && game.pp_version === 0;
                            const scoreText = isLegacyDeath
                                ? streakTemplate.replace("{count}", game.streak.toLocaleString(locale))
                                : pointsTemplate.replace("{points}", game.points.toLocaleString(locale));
                            const detailText = streakTemplate.replace("{count}", game.streak.toLocaleString(locale));
                            const dateText = relativeDates && generatedAt ? formatHoursAgo(endedAt, new Date(generatedAt)) : endedAt.toLocaleDateString(locale, { dateStyle: "medium" });
                            const fullDateText = endedAt.toLocaleString(locale, { dateStyle: "full", timeStyle: "long" });
                            const hasPp = game.pp_version > 0;
                            const ppText = hasPp ? ppTemplate.replace("{pp}", Number(game.pp).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })) : "Legacy";

                            return (
                                <Link
                                    key={`${game.ended_at.toString()}-${index}`}
                                    href={`/scores/${game.id}`}
                                    className="group grid min-h-14 grid-cols-[3.25rem_minmax(0,1fr)_6.75rem] items-stretch overflow-hidden rounded-xl bg-muted/55 ring-1 ring-inset ring-border/35 transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-muted/75 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 sm:grid-cols-[3.5rem_minmax(0,1fr)_6rem_6.75rem]"
                                >
                                    <div className={`flex items-center justify-center border-r border-border/35 ${isTopSection && index < 3 ? "bg-primary/15 text-primary" : "bg-background/15 text-muted-foreground"}`}>
                                        {isTopSection ? <span className="text-sm font-bold tabular-nums">#{index + 1}</span> : <Clock3 aria-hidden="true" className="size-4" />}
                                    </div>

                                    <div className="min-w-0 self-center px-3 py-2 sm:px-4">
                                        <div className="truncate text-sm font-semibold text-foreground">{scoreText}</div>
                                        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                                            <span className="truncate sm:hidden">{!isLegacyDeath ? detailText : ppText}</span>
                                            {!isLegacyDeath && <span aria-hidden="true" className="sm:hidden">·</span>}
                                            <time dateTime={endedAt.toISOString()} title={fullDateText} className="shrink-0 cursor-help">
                                                {dateText}
                                            </time>
                                        </div>
                                    </div>

                                    <div className="hidden items-center justify-center border-l border-border/35 bg-background/10 px-2 text-center sm:flex">
                                        {!isLegacyDeath && (
                                            <div>
                                                <div className="text-xs font-semibold tabular-nums text-foreground">{game.streak.toLocaleString(locale)}x</div>
                                                <div className="text-[10px] text-muted-foreground">streak</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="relative flex items-center justify-center border-l border-primary/10 bg-primary/[0.08] px-2 text-center">
                                        <div title={hasPp ? undefined : "pp was not recorded for this legacy score"} className={`text-sm font-bold tabular-nums ${hasPp ? "text-primary" : "text-muted-foreground"}`}>
                                            {ppText}
                                        </div>
                                        <ChevronRight aria-hidden="true" className="absolute right-2 size-4 text-primary/45 transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {!expanded && games.length > 5 && (
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-muted/35 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                        >
                            {showMoreText}
                            <ChevronDown aria-hidden="true" className="size-3.5" />
                        </button>
                    )}
                </>
            ) : (
                <div className="rounded-xl bg-muted/35 px-4 py-6 text-sm text-muted-foreground">{emptyText}</div>
            )}
        </section>
    );
}

function formatHoursAgo(date: Date, now: Date): string {
    const elapsedMs = Math.max(0, now.getTime() - date.getTime());
    const hours = Math.floor(elapsedMs / 3_600_000);
    return hours === 0 ? "<1h ago" : `${hours}h ago`;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 px-3 first:pl-0 last:pr-0 sm:px-5">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-[15px] font-semibold tabular-nums tracking-tight text-foreground sm:text-lg">{value}</dd>
        </div>
    );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
    return (
        <>
            <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
            <dd className="text-right font-semibold tabular-nums text-foreground">{value}</dd>
        </>
    );
}

function RankHistory({ title, points, locale }: { title: string; points: UserRankHistoryPoint[]; locale: string }) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (points.length === 0) return null;

    const ranks = points.map((point) => point.rank);
    const bestRank = Math.min(...ranks);
    const worstRank = Math.max(...ranks);
    const range = Math.max(1, worstRank - bestRank);
    const coordinates = points.map((point, index) => ({
        x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100,
        y: 5 + ((point.rank - bestRank) / range) * 30,
    }));
    const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
    const firstDate = new Date(points[0].recorded_at);
    const lastDate = new Date(points[points.length - 1].recorded_at);
    const dateLabel =
        points.length === 1
            ? firstDate.toLocaleDateString(locale, { month: "short", day: "numeric" })
            : `${firstDate.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${lastDate.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
    const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
    const hoveredCoordinate = hoveredIndex === null ? null : coordinates[hoveredIndex];

    return (
        <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="font-medium">{title}</span>
                <span className="shrink-0 tabular-nums">{dateLabel}</span>
            </div>
            <div
                className="relative h-12 cursor-crosshair text-primary"
                onPointerMove={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
                    setHoveredIndex(points.length === 1 ? 0 : Math.round(position * (points.length - 1)));
                }}
                onPointerLeave={() => setHoveredIndex(null)}
            >
                <svg aria-label={title} role="img" viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                    <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.35" vectorEffect="non-scaling-stroke" />
                </svg>
                {hoveredPoint && hoveredCoordinate && (
                    <div className="pointer-events-none absolute size-0" style={{ left: `${hoveredCoordinate.x}%`, top: `${(hoveredCoordinate.y / 40) * 100}%` }}>
                        <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card" />
                        <span
                            className={`absolute whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] font-medium tabular-nums text-popover-foreground shadow-md ${
                                hoveredCoordinate.y > 20 ? "bottom-2.5" : "top-2.5"
                            } ${hoveredCoordinate.x < 15 ? "left-0" : hoveredCoordinate.x > 85 ? "right-0" : "left-1/2 -translate-x-1/2"}`}
                        >
                            #{hoveredPoint.rank.toLocaleString(locale)} · {new Date(hoveredPoint.recorded_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatDuration(milliseconds: bigint, locale: string): string {
    const totalMinutes = Number(milliseconds / 60_000n);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) return `${minutes.toLocaleString(locale)}m`;
    return `${hours.toLocaleString(locale)}h ${minutes.toLocaleString(locale)}m`;
}
