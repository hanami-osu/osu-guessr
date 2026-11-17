"use client";

import { Game, GameMode, UserDailyStats, UserLifetimeModeStats, UserRankHistoryPoint, UserWithStats } from "@/actions/types";
import { GAME_VARIANTS, GameVariant, isContinuousVariant } from "@/app/games/config";
import type { ProfileVariant } from "@/lib/profile-params";
import { useTranslationsContext } from "@/context/translations-provider";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Clock3, Expand } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import UserNotFound from "./NotFound";
import { SectionLabel } from "@/components/page-heading";
import type { Translations } from "@/lib/translations";

const gamemodes: GameMode[] = [GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp];

interface UserProfileClientProps {
    currentMode: GameMode;
    currentVariant: ProfileVariant;
    banchoId: string;
    user?: UserWithStats | null;
    lifetimeModeStats?: UserLifetimeModeStats;
    dailyStats?: UserDailyStats | null;
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
    dailyStats,
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
                <h1 className="font-display text-2xl font-semibold">{t.user.profile.loadFailed}</h1>
                <p className="mt-3 text-muted-foreground">{loadError}</p>
                <Link href="/" className="mt-5 inline-block text-primary hover:underline">
                    {t.user.notFound.actions.home}
                </Link>
            </div>
        );
    }

    if (!user) return <UserNotFound />;

    const findStats = (mode: GameMode, variant: GameVariant) => user.achievements?.find((stat) => stat.game_mode === mode && stat.variant === variant);
    const isDaily = currentVariant === "daily";
    const modeStats = isDaily ? undefined : findStats(currentMode, currentVariant);
    const modePp = Number(modeStats?.profile_pp ?? 0);
    const activeTimeMs = modeStats?.total_response_time_ms ?? 0n;
    const roundsPlayed = modeStats?.rounds_played ?? 0;
    const accuracy = roundsPlayed > 0 ? ((modeStats?.total_correct ?? 0) / roundsPlayed) * 100 : 0;
    const lifetime = lifetimeModeStats ?? {
        games_played: modeStats?.games_played ?? 0,
        total_score: modeStats?.total_score ?? 0n,
        highest_score: modeStats?.highest_score ?? 0,
        highest_streak: modeStats?.highest_streak ?? 0,
        average_streak: 0,
        last_played: modeStats?.last_played ?? null,
    };
    const formatRank = (rank?: number) => (rank ? `#${rank.toLocaleString(locale)}` : "-");
    const tabPp = (mode: GameMode, variant: GameVariant) => {
        const pp = Number(findStats(mode, variant)?.profile_pp ?? 0);
        return pp > 0 ? `${pp.toLocaleString(locale, { maximumFractionDigits: 0 })}pp` : null;
    };

    return (
        <div className="page-container pb-5 pt-3 md:pb-8 md:pt-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card/60">
                <div className="flex flex-col gap-1.5 bg-muted/35 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4">
                    <nav aria-label={t.user.profile.modeLabel} className="-mx-2.5 flex items-center gap-1.5 overflow-x-auto px-2.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
                        {gamemodes.map((mode) => (
                            <Link
                                key={mode}
                                href={`/user/${banchoId}?mode=${mode}&variant=${currentVariant}`}
                                scroll={false}
                                aria-current={currentMode === mode ? "page" : undefined}
                                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${currentMode === mode ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            >
                                {t.leaderboard.filters.mode[mode]}
                                <TabPp value={isDaily ? null : tabPp(mode, currentVariant)} />
                            </Link>
                        ))}
                    </nav>

                    <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-border sm:block" />

                    <nav aria-label={t.user.profile.variantLabel} className="-mx-2.5 flex items-center gap-1.5 overflow-x-auto px-2.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
                        {(["daily", ...GAME_VARIANTS] as ProfileVariant[]).map((variant) => (
                            <Link
                                key={variant}
                                href={`/user/${banchoId}?mode=${currentMode}&variant=${variant}`}
                                scroll={false}
                                aria-current={currentVariant === variant ? "page" : undefined}
                                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${currentVariant === variant ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            >
                                {variant === "daily" ? t.user.profile.daily.title : t.leaderboard.filters.variant[variant]}
                                <TabPp value={variant === "daily" ? null : tabPp(currentMode, variant)} />
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="relative h-28 overflow-hidden sm:h-48 md:h-56">
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
                            <div className="-mt-10 translate-y-2 flex min-w-0 items-end gap-4 sm:-mt-14 sm:gap-5">
                                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border-4 border-card bg-muted sm:size-28">
                                    <Image src={user.avatar_url} alt="" fill sizes="(min-width: 640px) 112px, 80px" priority unoptimized className="object-cover" />
                                </div>

                                <div className="min-w-0 pb-1.5">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                        <h1 className="break-words font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">{user.username}</h1>
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

                            <div className="mt-6 sm:mt-8">
                                {isDaily ? (
                                    <DailyProfileCalendar stats={dailyStats} locale={locale} t={t.user.profile.daily} />
                                ) : (
                                    <>
                                        <dl className="grid grid-cols-3 divide-x divide-border/60">
                                            <SummaryMetric label={t.user.profile.stats.globalRank} value={formatRank(user.ranks?.modeRanks[currentMode]?.[currentVariant])} />
                                            <SummaryMetric label={t.user.profile.gameStats.profilePp} value={`${modePp.toLocaleString(locale, { maximumFractionDigits: 1 })} pp`} />
                                            <SummaryMetric label={t.user.profile.gameStats.accuracy} value={`${accuracy.toLocaleString(locale, { maximumFractionDigits: 1 })}%`} />
                                        </dl>
                                        <RankHistory title={t.user.profile.stats.rankHistory} peakTemplate={t.user.profile.stats.peakRank} points={rankHistory} locale={locale} />
                                    </>
                                )}
                            </div>
                        </section>

                        <div aria-hidden="true" className="hidden bg-border/70 lg:block" />
                        <section aria-label={isDaily ? t.user.profile.daily.title : t.user.profile.gameStats.title} className="mt-6 min-w-0 lg:mt-8 lg:self-start">
                            {isDaily ? (
                                <DailyProfileStats stats={dailyStats} locale={locale} t={t.user.profile.daily} />
                            ) : (
                                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 rounded-xl bg-muted/45 p-4 text-sm sm:p-5">
                                    <DetailMetric label={t.user.profile.gameStats.gamesPlayed} value={lifetime.games_played.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.roundsPlayed} value={roundsPlayed.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.totalScore} value={lifetime.total_score.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.bestStreak} value={lifetime.highest_streak.toLocaleString(locale)} />
                                    <DetailMetric label={t.user.profile.gameStats.averageStreak} value={lifetime.average_streak.toLocaleString(locale, { maximumFractionDigits: 1 })} />
                                    <DetailMetric label={t.user.profile.stats.playtime} value={formatDuration(activeTimeMs, locale)} />
                                </dl>
                            )}
                        </section>
                    </div>
                </div>
            </div>

            {!isDaily && <div className="mt-6 rounded-lg border border-border bg-card/60 p-4 sm:p-5">
                <ScoreSection
                    title={t.user.profile.topGames.title}
                    emptyText={t.user.profile.topGames.empty}
                    games={bestScores}
                    kind="top"
                    locale={locale}
                    templates={t.user.profile.topGames}
                    showMoreText={t.user.profile.showMore}
                />
                <div aria-hidden="true" className="my-6 h-px bg-border/60" />
                <ScoreSection
                    title={t.user.profile.recentGames.title}
                    emptyText={t.user.profile.recentGames.noGames}
                    games={recentScores}
                    kind="recent"
                    locale={locale}
                    templates={t.user.profile.topGames}
                    showMoreText={t.user.profile.showMore}
                    relativeDates
                    generatedAt={generatedAt}
                />
            </div>}
        </div>
    );
}

interface ScoreSectionProps {
    title: string;
    emptyText: string;
    games: Game[];
    kind: "top" | "recent";
    locale: string;
    templates: Translations["user"]["profile"]["topGames"];
    showMoreText: string;
    relativeDates?: boolean;
    generatedAt?: string;
}

function ScoreSection({ title, emptyText, games, kind, locale, templates, showMoreText, relativeDates = false, generatedAt }: ScoreSectionProps) {
    const [expanded, setExpanded] = useState(false);
    const visibleGames = expanded ? games : games.slice(0, 5);
    const isTopSection = kind === "top";

    return (
        <section aria-label={title}>
            <div className="mb-3 flex items-center gap-2 px-1">
                <SectionLabel className="shrink-0">{title}</SectionLabel>
                {isTopSection && <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium tabular-nums text-muted-foreground">{games.length.toLocaleString(locale)}</span>}
            </div>

            {games.length > 0 ? (
                <>
                    <div className="space-y-1.5">
                        {visibleGames.map((game, index) => {
                            const endedAt = new Date(game.ended_at);
                            const isLegacy = game.pp_version === 0;
                            const isLegacyDeath = isLegacy && game.variant === "death";
                            const pointsText = templates.points.replace("{points}", game.points.toLocaleString(locale));
                            const streakText = templates.streak.replace("{count}", game.streak.toLocaleString(locale));
                            const correctText = isContinuousVariant(game.variant)
                                ? templates.correct.replace("{count}", game.correct_count.toLocaleString(locale))
                                : templates.correctOf.replace("{correct}", game.correct_count.toLocaleString(locale)).replace("{total}", game.rounds_played.toLocaleString(locale));
                            const mainText = isLegacyDeath ? streakText : isLegacy ? pointsText : correctText;
                            const dateText = relativeDates && generatedAt ? formatRelativeTime(endedAt, new Date(generatedAt), locale) : endedAt.toLocaleDateString(locale, { dateStyle: "medium" });
                            const fullDateText = endedAt.toLocaleString(locale, { dateStyle: "full", timeStyle: "long" });
                            const ppText = isLegacy ? "Legacy" : templates.pp.replace("{pp}", Number(game.pp).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

                            return (
                                <Link
                                    key={game.id}
                                    href={`/scores/${game.id}`}
                                    className="group grid min-h-14 grid-cols-[3.25rem_minmax(0,1fr)_6.75rem] items-stretch overflow-hidden rounded-xl bg-muted/55 ring-1 ring-inset ring-border/35 transition-colors hover:bg-muted/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem_6.75rem]"
                                >
                                    <div
                                        className={`flex items-center justify-center border-r border-border/35 ${isTopSection && index < 3 ? "bg-primary/15 text-primary" : "bg-background/15 text-muted-foreground"}`}
                                    >
                                        {isTopSection ? <span className="text-sm font-bold tabular-nums">#{index + 1}</span> : <Clock3 aria-hidden="true" className="size-4" />}
                                    </div>

                                    <div className="min-w-0 self-center px-3 py-2 sm:px-4">
                                        <div className={`truncate text-sm font-semibold ${isLegacy && !isLegacyDeath && game.points < 0 ? "text-destructive" : "text-foreground"}`}>{mainText}</div>
                                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {!isLegacy && <span className="hidden sm:inline">{pointsText} · </span>}
                                            <time dateTime={endedAt.toISOString()} title={fullDateText} className="cursor-help">
                                                {dateText}
                                            </time>
                                        </div>
                                    </div>

                                    <div className="hidden items-center justify-center border-l border-border/35 bg-background/10 px-2 text-center text-xs font-medium tabular-nums text-muted-foreground sm:flex">
                                        {!isLegacyDeath && streakText}
                                    </div>

                                    <div className="relative flex items-center justify-center border-l border-primary/10 bg-primary/[0.08] px-2 text-center">
                                        <div
                                            title={isLegacy ? "pp was not recorded for this legacy score" : undefined}
                                            className={`font-mono text-sm font-bold tabular-nums ${isLegacy ? "text-muted-foreground" : "text-primary"}`}
                                        >
                                            {ppText}
                                        </div>
                                        <ChevronRight aria-hidden="true" className="absolute right-2 size-4 text-primary/45" />
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

function formatRelativeTime(date: Date, now: Date, locale: string): string {
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const minutes = Math.min(0, Math.round((date.getTime() - now.getTime()) / 60_000));
    if (minutes > -60) return formatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours > -24) return formatter.format(hours, "hour");
    return formatter.format(Math.round(hours / 24), "day");
}

function TabPp({ value }: { value: string | null }) {
    if (!value) return null;
    return <span className="ml-1.5 text-xs tabular-nums opacity-60">{value}</span>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 px-3 first:pl-0 last:pr-0 sm:px-5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-base font-semibold tabular-nums tracking-tight text-foreground sm:text-lg">{value}</dd>
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

function DailyProfileStats({ stats, locale, t }: { stats?: UserDailyStats | null; locale: string; t: Translations["user"]["profile"]["daily"] }) {
    return (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 rounded-xl bg-muted/45 p-4 text-sm sm:p-5">
            <DetailMetric label={t.dailiesPlayed} value={(stats?.dailies_played ?? 0).toLocaleString(locale)} />
            <DetailMetric label={t.totalPoints} value={(stats?.total_points ?? 0n).toLocaleString(locale)} />
            <DetailMetric label={t.bestStreak} value={(stats?.best_streak ?? 0).toLocaleString(locale)} />
            <DetailMetric label={t.timeAnswering} value={formatDuration(stats?.total_response_time_ms ?? 0n, locale)} />
        </dl>
    );
}

function DailyProfileCalendar({ stats, locale, t }: { stats?: UserDailyStats | null; locale: string; t: Translations["user"]["profile"]["daily"] }) {
    const calendar = stats?.calendar ?? [];
    const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const getWeekKey = (date: string) => {
        const weekStart = new Date(`${date}T00:00:00Z`);
        weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
        return weekStart.toISOString().slice(0, 10);
    };
    const weeks = new Map<string, UserDailyStats["calendar"]>();
    for (const day of calendar) {
        const week = getWeekKey(day.date);
        weeks.set(week, [...(weeks.get(week) ?? []), day]);
    }
    const weekKeys = [...weeks.keys()].sort();
    const currentDate = calendar.find((day) => day.status === "today")?.date ?? calendar.at(-1)?.date;
    const currentWeek = currentDate ? getWeekKey(currentDate) : "";
    const currentMonth = currentDate?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
    const monthKeys = [...new Set(calendar.map((day) => day.date.slice(0, 7)))].sort();
    const visibleMonth = selectedMonth && monthKeys.includes(selectedMonth) ? selectedMonth : currentMonth;
    const visibleMonthIndex = monthKeys.indexOf(visibleMonth);
    const visibleWeek = selectedWeek && weeks.has(selectedWeek) ? selectedWeek : currentWeek;
    const visibleWeekIndex = weekKeys.indexOf(visibleWeek);
    const visibleWeekDays: Array<UserDailyStats["calendar"][number] | undefined> = Array.from({ length: 7 }, () => undefined);
    for (const day of weeks.get(visibleWeek) ?? []) {
        visibleWeekDays[new Date(`${day.date}T00:00:00Z`).getUTCDay()] = day;
    }
    const lastVisibleDate = [...visibleWeekDays].reverse().find((day) => day !== undefined)?.date ?? visibleWeek;
    const visibleWeekDate = new Date(`${lastVisibleDate}T00:00:00Z`);
    const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, index + 4))));
    const visibleMonthDate = new Date(`${visibleMonth}-01T00:00:00Z`);
    const monthDays = new Map((calendar.filter((day) => day.date.startsWith(visibleMonth))).map((day) => [Number(day.date.slice(-2)), day]));
    const daysInMonth = new Date(Date.UTC(visibleMonthDate.getUTCFullYear(), visibleMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
    const monthStartOffset = visibleMonthDate.getUTCDay();
    const calendarDayClass = (status: UserDailyStats["calendar"][number]["status"] | undefined) =>
        status === "played" ? "bg-emerald-500 text-white" : status === "missed" ? "bg-rose-500/15 text-white" : status === "today" ? "bg-background text-muted-foreground ring-1 ring-inset ring-border" : "text-muted-foreground/50";

    return (
        <div className="min-w-0 rounded-xl bg-muted/35 p-3 sm:p-4">
            {calendar.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.calendarEmpty}</p>
            ) : (
                <>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[0.7rem] font-medium text-muted-foreground">{visibleWeekDate.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                        <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
                            <DialogTrigger asChild>
                                <button type="button" aria-label="Open fullscreen calendar" title="Open fullscreen calendar" className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                                    <Expand aria-hidden="true" className="size-3.5" />
                                </button>
                            </DialogTrigger>
                            <DialogContent className="w-[calc(100%-2rem)] max-w-2xl gap-5">
                                <div className="pr-8">
                                    <DialogTitle className="text-base">{t.calendarTitle}</DialogTitle>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        aria-label="Previous month"
                                        title="Previous month"
                                        disabled={visibleMonthIndex <= 0}
                                        onClick={() => setSelectedMonth(monthKeys[visibleMonthIndex - 1] ?? null)}
                                        className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                        <ArrowLeft aria-hidden="true" className="size-4" />
                                    </button>
                                    <h3 className="text-sm font-medium text-foreground">{visibleMonthDate.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
                                    <button
                                        type="button"
                                        aria-label="Next month"
                                        title="Next month"
                                        disabled={visibleMonthIndex < 0 || visibleMonthIndex >= monthKeys.indexOf(currentMonth)}
                                        onClick={() => setSelectedMonth(monthKeys[visibleMonthIndex + 1] ?? null)}
                                        className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                        <ArrowRight aria-hidden="true" className="size-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-7 gap-2" role="grid" aria-label={visibleMonthDate.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}>
                                    {weekdays.map((weekday, index) => <span key={`${weekday}-${index}`} className="pb-1 text-center text-xs text-muted-foreground">{weekday}</span>)}
                                    {Array.from({ length: monthStartOffset }, (_, index) => <span key={`month-blank-${index}`} aria-hidden="true" />)}
                                    {Array.from({ length: daysInMonth }, (_, index) => {
                                        const dayNumber = index + 1;
                                        const day = monthDays.get(dayNumber);
                                        const date = `${visibleMonth}-${String(dayNumber).padStart(2, "0")}`;
                                        const statusLabel = day ? (day.status === "played" ? t.played : day.status === "today" ? t.today : t.missed) : null;
                                        const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "full", timeZone: "UTC" });
                                        const label = statusLabel ? `${dateLabel}: ${statusLabel}` : dateLabel;
                                        return <span key={date} role="gridcell" aria-label={label} title={label} className={`mx-auto grid size-9 place-items-center rounded-full text-sm font-medium tabular-nums ${calendarDayClass(day?.status)}`}>{dayNumber}</span>;
                                    })}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1">
                        <button
                            type="button"
                            aria-label="Previous week"
                            title="Previous week"
                            disabled={visibleWeekIndex <= 0}
                            onClick={() => setSelectedWeek(weekKeys[visibleWeekIndex - 1] ?? null)}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <ArrowLeft aria-hidden="true" className="size-3.5" />
                        </button>
                        <div className="grid grid-cols-7 gap-x-0.5" role="grid" aria-label="Daily challenge week">
                            {weekdays.map((weekday, index) => <span key={`${weekday}-${index}`} className="truncate pb-1 text-center text-[0.55rem] text-muted-foreground">{weekday}</span>)}
                            {visibleWeekDays.map((day, index) => {
                                if (!day) return <span key={`empty-${index}`} aria-hidden="true" />;
                                const statusLabel = day.status === "played" ? t.played : day.status === "today" ? t.today : t.missed;
                                const dayNumber = Number(day.date.slice(-2));
                                return <span key={day.date} role="gridcell" aria-label={`${new Date(`${day.date}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "full", timeZone: "UTC" })}: ${statusLabel}`} title={`${day.date}: ${statusLabel}`} className={`mx-auto grid size-6 place-items-center rounded-full text-[0.65rem] font-medium tabular-nums ${calendarDayClass(day.status)}`}>{dayNumber}</span>;
                            })}
                        </div>
                        <button
                            type="button"
                            aria-label="Next week"
                            title="Next week"
                            disabled={visibleWeekIndex < 0 || visibleWeekIndex >= weekKeys.indexOf(currentWeek)}
                            onClick={() => setSelectedWeek(weekKeys[visibleWeekIndex + 1] ?? null)}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <ArrowRight aria-hidden="true" className="size-3.5" />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function RankHistory({ title, peakTemplate, points, locale }: { title: string; peakTemplate: string; points: UserRankHistoryPoint[]; locale: string }) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (points.length === 0) return null;

    const ranks = points.map((point) => point.rank);
    const bestRank = Math.min(...ranks);
    const worstRank = Math.max(...ranks);
    const range = worstRank - bestRank;
    // An unchanged rank sits mid-height so it reads as a steady line rather than a filled block.
    const coordinates = points.map((point, index) => ({
        x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100,
        y: range === 0 ? 20 : 5 + ((point.rank - bestRank) / range) * 30,
    }));
    const linePath = points.length === 1 ? "M 0 20 L 100 20" : coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
    const areaPath = `${linePath} L 100 40 L 0 40 Z`;
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
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-medium">
                    {title} <span className="text-primary">· {peakTemplate.replace("{rank}", `#${bestRank.toLocaleString(locale)}`)}</span>
                </span>
                <span className="shrink-0 tabular-nums">{dateLabel}</span>
            </div>
            <div
                className="relative h-16 cursor-crosshair text-primary sm:h-24"
                onPointerMove={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
                    setHoveredIndex(points.length === 1 ? 0 : Math.round(position * (points.length - 1)));
                }}
                onPointerLeave={() => setHoveredIndex(null)}
            >
                <svg aria-label={title} role="img" viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                    <defs>
                        <linearGradient id="rank-history-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path d={areaPath} fill="url(#rank-history-fill)" stroke="none" />
                    <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.35" vectorEffect="non-scaling-stroke" />
                </svg>
                {hoveredPoint && hoveredCoordinate && (
                    <div className="pointer-events-none absolute size-0" style={{ left: `${hoveredCoordinate.x}%`, top: `${(hoveredCoordinate.y / 40) * 100}%` }}>
                        <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card" />
                        <span
                            className={`absolute whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[0.7rem] font-medium tabular-nums text-popover-foreground shadow-md ${
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
    const totalMilliseconds = Number(milliseconds);
    const value = totalMilliseconds < 60_000 ? totalMilliseconds / 1_000 : totalMilliseconds < 3_600_000 ? totalMilliseconds / 60_000 : totalMilliseconds / 3_600_000;
    const unit = totalMilliseconds < 60_000 ? "s" : totalMilliseconds < 3_600_000 ? "m" : "h";
    return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}${unit}`;
}
