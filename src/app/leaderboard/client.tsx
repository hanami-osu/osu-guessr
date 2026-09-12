"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getTopPlayersAction } from "@/actions/user-server";
import { GameMode, type TopPlayer } from "@/actions/types";
import type { GameVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import { AdSlider } from "@/components/Ads";
import { createLatestRequestGate } from "@/lib/latest-request";

interface LeaderboardClientProps {
    initialData: TopPlayer[];
    initialError?: string | null;
}

export default function LeaderboardClient({ initialData, initialError = null }: LeaderboardClientProps) {
    const { t, locale } = useTranslationsContext();
    const { data: session } = useSession();
    const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.Background);
    const [selectedVariant, setSelectedVariant] = useState<GameVariant>("classic");
    const [leaderboardData, setLeaderboardData] = useState<Array<TopPlayer>>(initialData);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(initialError);
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const requestGate = useRef(createLatestRequestGate());
    const isInitialRender = useRef(true);

    const errorMessage = t.notifications.error;

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
                const data = await getTopPlayersAction(selectedMode, selectedVariant, pageSize, offset);
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
    }, [selectedMode, selectedVariant, page, pageSize, errorMessage]);

    const gameModes: GameMode[] = [GameMode.Background, GameMode.Audio, GameMode.Skin];

    return (
        <main className="page-container pb-5 pt-3 md:pb-8 md:pt-4">
            <div className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <header className="bg-muted/35 px-4 py-4 sm:px-6 sm:py-5">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t.leaderboard.title}</h1>
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{t.leaderboard.description}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t.user.profile.modeLabel}>
                            {gameModes.map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedMode === mode}
                                    onClick={() => {
                                        setSelectedMode(mode);
                                        setPage(1);
                                    }}
                                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === mode ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                >
                                    {t.leaderboard.filters.mode[mode]}
                                </button>
                            ))}
                        </div>

                        <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-border sm:block" />

                        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t.user.profile.variantLabel}>
                            {(["classic", "survival"] as const).map((variant) => (
                                <button
                                    key={variant}
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedVariant === variant}
                                    onClick={() => {
                                        setSelectedVariant(variant);
                                        setPage(1);
                                    }}
                                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedVariant === variant ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                >
                                    {t.leaderboard.filters.variant[variant]}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="p-2 sm:p-3">
                    {isLoading ? (
                        <div className="rounded-xl bg-muted/35 px-4 py-8 text-center text-sm text-muted-foreground" role="status">
                            {t.common.loading}
                        </div>
                    ) : error ? (
                        <div className="rounded-xl bg-muted/35 px-4 py-8 text-center text-sm text-destructive" role="alert">
                            {error}
                        </div>
                    ) : leaderboardData.length === 0 ? (
                        <div className="rounded-xl bg-muted/35 px-4 py-8 text-center text-sm text-muted-foreground" role="status">
                            {t.leaderboard.empty}
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-border/35">
                            <div className="overflow-x-auto">
                                <table className="w-full table-fixed sm:table-auto">
                                    <caption className="sr-only">{t.leaderboard.title}</caption>
                                    <thead className="bg-muted/35 text-[11px] font-semibold text-muted-foreground">
                                        <tr>
                                            <th scope="col" className="w-14 px-3 py-2.5 text-left sm:w-auto sm:px-5">{t.leaderboard.table.rank}</th>
                                            <th scope="col" className="px-2 py-2.5 text-left sm:px-5">{t.leaderboard.table.player}</th>
                                            <th scope="col" className="w-24 px-3 py-2.5 text-right sm:w-auto sm:px-5">{t.leaderboard.table.profilePp}</th>
                                            <th scope="col" className="hidden px-5 py-2.5 text-right lg:table-cell">{t.leaderboard.table.bestRunPp}</th>
                                            {selectedVariant === "survival" && (
                                                <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell sm:px-5">
                                                    {t.leaderboard.table.bestStreak}
                                                </th>
                                            )}
                                            <th scope="col" className="hidden px-5 py-2.5 text-right md:table-cell">{t.leaderboard.table.gamesPlayed}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/35 bg-card/35">
                                        {leaderboardData.map((player, index) => (
                                            <tr key={player.bancho_id} className={`transition-colors hover:bg-muted/45 ${session?.user?.name === player.username ? "bg-primary/10" : ""}`}>
                                                <td className="px-3 py-3 sm:px-5 sm:py-3.5">
                                                    <span className={`${index + 1 <= 3 && page === 1 ? "rounded-md bg-primary/15 px-2 py-1 font-bold text-primary" : "text-muted-foreground"} font-mono text-sm tabular-nums`}>
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
                                                            <span className="truncate text-sm font-semibold text-foreground">{player.username}</span>
                                                            {player.badges &&
                                                                player.badges.map((badge, badgeIndex) => (
                                                                    <Badge
                                                                        key={badgeIndex}
                                                                        variant="secondary"
                                                                        className="hidden text-[10px] font-medium lg:inline-flex"
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
                                                <td className="bg-primary/[0.06] px-3 py-3 text-right text-sm font-bold tabular-nums text-primary sm:px-5 sm:py-3.5">
                                                    {Number(player.profile_pp).toLocaleString(locale, { maximumFractionDigits: 1 })}
                                                </td>
                                                <td className="hidden px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground lg:table-cell">
                                                    {Number(player.best_run_pp).toLocaleString(locale, { maximumFractionDigits: 1 })}
                                                </td>
                                                {selectedVariant === "survival" && (
                                                    <td className="hidden px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-foreground sm:table-cell">
                                                        {player.highest_streak.toLocaleString(locale)}
                                                    </td>
                                                )}
                                                <td className="hidden px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground md:table-cell">{player.games_played}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-border/50 bg-muted/35 px-4 py-3 sm:flex-row">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Page size</span>
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
                            {"Prev"}
                        </Button>
                        <span className="mx-2 min-w-14 text-center text-xs text-muted-foreground">Page {page}</span>
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setPage((p) => p + 1)} disabled={leaderboardData.length < pageSize}>
                            {"Next"}
                        </Button>
                    </div>
                </div>

                <AdSlider />
            </div>
        </main>
    );
}
