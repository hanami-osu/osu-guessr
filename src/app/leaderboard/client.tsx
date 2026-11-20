"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getDailyTopPlayersAction, getTopPlayersAction } from "@/actions/user-server";
import { GameMode, type TopPlayer } from "@/actions/types";
import { GAME_VARIANTS, type GameVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import { AdSlider } from "@/components/Ads";
import { createLatestRequestGate } from "@/lib/latest-request";

interface LeaderboardClientProps {
    initialData: TopPlayer[];
    initialMode: GameMode;
    initialVariant: LeaderboardVariant;
    initialError?: string | null;
    initialDailySort?: "streak" | "played";
}

type LeaderboardVariant = GameVariant | "daily";
const DAILY_SORTS = ["streak", "played"] as const;

export default function LeaderboardClient({ initialData, initialMode, initialVariant, initialDailySort = "streak", initialError = null }: LeaderboardClientProps) {
    const { t, locale } = useTranslationsContext();
    const { data: session } = useSession();
    const [dailySort, setDailySort] = useState<"streak" | "played">(initialDailySort);
    const [selectedMode, setSelectedMode] = useState<GameMode>(initialMode);
    const [selectedVariant, setSelectedVariant] = useState<LeaderboardVariant>(initialVariant);
    const [leaderboardData, setLeaderboardData] = useState<Array<TopPlayer>>(initialData);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(initialError);
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const requestGate = useRef(createLatestRequestGate());
    const isInitialRender = useRef(true);

    const errorMessage = t.notifications.error;
    const isDaily = selectedVariant === "daily";

    function syncFilters(mode: GameMode, variant: LeaderboardVariant, sort = dailySort) {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", mode);
        url.searchParams.set("variant", variant);
        if (variant === "daily") url.searchParams.set("dailySort", sort);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    useEffect(() => {
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        const request = requestGate.current.begin();

        async function fetchLeaderboard() {
            setIsLoading(true);
            setError(null);

            try {
                const offset = (page - 1) * pageSize;
                const data = selectedVariant === "daily"
                    ? await getDailyTopPlayersAction(selectedMode, pageSize, offset, dailySort)
                    : await getTopPlayersAction(selectedMode, selectedVariant, pageSize, offset);
                if (request.isCurrent()) {
                    setLeaderboardData(data);
                }
            } catch (error) {
                if (request.isCurrent()) {
                    console.error("Failed to fetch leaderboard:", error);
                    setError(error instanceof Error ? error.message : errorMessage);
                }
            } finally {
                if (request.isCurrent()) {
                    setIsLoading(false);
                }
            }
        }

        void fetchLeaderboard();
        return () => request.cancel();
    }, [selectedMode, selectedVariant, dailySort, page, pageSize, errorMessage]);

    const gameModes: GameMode[] = [GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp];

    return (
        <div className="page-container pb-5 pt-3 md:pb-8 md:pt-4">
            <div>
                <header className="py-5 sm:py-6">
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t.leaderboard.title}</h1>
                </header>

                <div className="rounded-t-lg bg-card/60 px-4 pt-2 sm:px-5">
                    <div className="grid grid-cols-2 gap-x-3 border-b border-border/50 sm:flex sm:flex-wrap sm:gap-x-2" role="group" aria-label={t.user.profile.variantLabel}>
                        {([...GAME_VARIANTS, "daily"] as const).map((variant) => (
                            <button
                                key={variant}
                                type="button"
                                aria-pressed={selectedVariant === variant}
                                onClick={() => {
                                    setSelectedVariant(variant);
                                    setPage(1);
                                    syncFilters(selectedMode, variant);
                                }}
                                className={`min-h-11 border-b-2 px-2 py-2 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selectedVariant === variant ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            >
                                {variant === "daily" ? t.game.daily.title : t.leaderboard.filters.variant[variant]}
                            </button>
                        ))}
                    </div>

                    {isDaily ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3" role="group" aria-label={t.leaderboard.daily.rankBy}>
                            <span className="text-xs font-medium text-muted-foreground">{t.leaderboard.daily.rankBy}</span>
                            <div className="flex flex-wrap gap-2">
                                {DAILY_SORTS.map((sort) => (
                                    <Button
                                        key={sort}
                                        size="sm"
                                        className="h-11 sm:h-8"
                                        variant={dailySort === sort ? "default" : "outline"}
                                        aria-pressed={dailySort === sort}
                                        onClick={() => {
                                            setDailySort(sort);
                                            setPage(1);
                                            syncFilters(selectedMode, selectedVariant, sort);
                                        }}
                                    >
                                        {t.leaderboard.daily[sort].label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3" role="group" aria-label={t.user.profile.modeLabel}>
                            <span className="text-xs font-medium text-muted-foreground">{t.user.profile.modeLabel}</span>
                            <div className="flex flex-wrap gap-2">
                                {gameModes.map((mode) => (
                                    <Button
                                        key={mode}
                                        size="sm"
                                        className="h-11 sm:h-8"
                                        variant={selectedMode === mode ? "default" : "outline"}
                                        aria-pressed={selectedMode === mode}
                                        onClick={() => {
                                            setSelectedMode(mode);
                                            setPage(1);
                                            syncFilters(mode, selectedVariant);
                                        }}
                                    >
                                        {t.leaderboard.filters.mode[mode]}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-card/60 pt-4">
                    {isLoading ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground" role="status">
                            {t.common.loading}
                        </div>
                    ) : error ? (
                        <div className="px-4 py-8 text-center text-sm text-destructive" role="alert">
                            {error}
                        </div>
                    ) : leaderboardData.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground" role="status">
                            {isDaily ? t.leaderboard.daily.empty : t.leaderboard.empty}
                        </div>
                    ) : (
                        <div className="overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full table-fixed sm:table-auto">
                                    <caption className="sr-only">{t.leaderboard.title}</caption>
                                    <thead className="text-xs font-semibold text-muted-foreground">
                                        <tr>
                                            <th scope="col" className="w-14 px-3 py-2.5 text-left sm:w-auto sm:px-5">
                                                {t.leaderboard.table.rank}
                                            </th>
                                            <th scope="col" className="px-2 py-2.5 text-left sm:px-5">
                                                {t.leaderboard.table.player}
                                            </th>
                                            {isDaily ? (
                                                DAILY_SORTS.map((sort) => (
                                                    <th
                                                        key={sort}
                                                        scope="col"
                                                        aria-sort={dailySort === sort ? "descending" : undefined}
                                                        className={`w-32 px-3 py-2.5 text-right sm:w-auto sm:px-5 ${dailySort === sort ? "text-foreground" : "hidden md:table-cell"}`}
                                                    >
                                                        {t.leaderboard.daily[sort].column}
                                                        {dailySort === sort && <ArrowDown aria-hidden="true" className="ml-1 hidden size-3 align-text-bottom text-primary sm:inline-block" />}
                                                    </th>
                                                ))
                                            ) : (
                                                <>
                                                    <th scope="col" className="w-24 px-3 py-2.5 text-right sm:w-auto sm:px-5">{t.leaderboard.table.profilePp}</th>
                                                    <th scope="col" className="hidden px-5 py-2.5 text-right lg:table-cell">{t.leaderboard.table.bestRunPp}</th>
                                                </>
                                            )}
                                            {selectedVariant !== "classic" && selectedVariant !== "daily" && (
                                                <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell sm:px-5">
                                                    {t.leaderboard.table.bestStreak}
                                                </th>
                                            )}
                                            {selectedVariant !== "daily" && <th scope="col" className="hidden px-5 py-2.5 text-right md:table-cell">
                                                {t.leaderboard.table.gamesPlayed}
                                            </th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/25">
                                        {leaderboardData.map((player, index) => (
                                            <tr key={player.bancho_id} className={`transition-colors hover:bg-muted/45 ${session?.user?.name === player.username ? "bg-primary/10" : ""}`}>
                                                <td className="px-3 py-3 sm:px-5 sm:py-3.5">
                                                    <span
                                                        className={`${index + 1 <= 3 && page === 1 ? "rounded-md bg-primary/15 px-2 py-1 font-bold text-primary" : "text-muted-foreground"} font-mono text-sm tabular-nums`}
                                                    >
                                                        {(page - 1) * pageSize + index + 1}
                                                    </span>
                                                </td>
                                                <td className="min-w-0 px-2 py-3 sm:px-5 sm:py-3.5">
                                                    <Link href={`/user/${player.bancho_id}`} className="group flex min-w-0 items-center gap-2 transition-colors hover:text-primary sm:gap-3">
                                                        <Image
                                                            src={player.avatar_url || "/placeholder.svg"}
                                                            alt=""
                                                            width={32}
                                                            height={32}
                                                            unoptimized
                                                            className="size-8 rounded-xl ring-2 ring-transparent transition-all group-hover:ring-primary/20"
                                                        />
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{player.username}</span>
                                                            {player.badges &&
                                                                player.badges.map((badge, badgeIndex) => (
                                                                    <Badge
                                                                        key={badgeIndex}
                                                                        variant="secondary"
                                                                        className="hidden text-[0.7rem] font-medium lg:inline-flex"
                                                                        style={{
                                                                            backgroundColor: `${badge.color}15`,
                                                                            color: badge.color,
                                                                            borderColor: `${badge.color}30`,
                                                                        }}
                                                                    >
                                                                        {badge.name}
                                                                    </Badge>
                                                                ))}
                                                        </div>
                                                    </Link>
                                                </td>
                                                {isDaily ? (
                                                    DAILY_SORTS.map((sort) => (
                                                        <td key={sort} className={`px-3 py-3 text-right text-sm tabular-nums sm:px-5 sm:py-3.5 ${dailySort === sort ? "font-mono font-bold text-primary" : "hidden text-muted-foreground md:table-cell"}`}>
                                                            {(sort === "streak" ? (player.best_daily_streak ?? 0) : player.games_played).toLocaleString(locale)}
                                                        </td>
                                                    ))
                                                ) : (
                                                    <>
                                                        <td className="px-3 py-3 text-right font-mono text-sm font-bold tabular-nums text-primary sm:px-5 sm:py-3.5">{Number(player.profile_pp).toLocaleString(locale, { maximumFractionDigits: 1 })}</td>
                                                        <td className="hidden px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground lg:table-cell">{Number(player.best_run_pp).toLocaleString(locale, { maximumFractionDigits: 1 })}</td>
                                                    </>
                                                )}
                                                {selectedVariant !== "classic" && selectedVariant !== "daily" && (
                                                    <td className="hidden px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-foreground sm:table-cell">
                                                        {player.highest_streak.toLocaleString(locale)}
                                                    </td>
                                                )}
                                                {selectedVariant !== "daily" && <td className="hidden px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground md:table-cell">{player.games_played}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col-reverse items-center justify-between gap-3 rounded-b-lg bg-card/60 px-4 py-4 sm:flex-row sm:px-5">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t.leaderboard.pagination.pageSize}</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(v) => {
                                setPageSize(Number(v));
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-20 border-border/60 bg-background/30">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[10, 25, 50, 100].map((s) => (
                                    <SelectItem key={s} value={String(s)}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                            {t.leaderboard.pagination.previous}
                        </Button>
                        <span className="mx-2 min-w-14 text-center text-xs text-muted-foreground">{t.leaderboard.pagination.page.replace("{page}", String(page))}</span>
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setPage((p) => p + 1)} disabled={leaderboardData.length < pageSize}>
                            {t.leaderboard.pagination.next}
                        </Button>
                    </div>
                </div>

                <AdSlider />
            </div>
        </div>
    );
}
