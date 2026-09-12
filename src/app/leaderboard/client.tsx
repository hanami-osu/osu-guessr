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
        <div className="page-container py-10 md:py-16">
            <div className="mb-8 md:mb-10">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t.leaderboard.title}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{t.leaderboard.description}</p>
            </div>

            <div className="mb-8 flex flex-col gap-5 border-b border-border/60 py-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-10">
                <div className="min-w-0">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.user.profile.modeLabel}</div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup" aria-label={t.user.profile.modeLabel}>
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
                                className={`border-b-2 pb-1 text-sm font-medium transition-colors ${selectedMode === mode ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            >
                                {t.leaderboard.filters.mode[mode]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="min-w-0">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.user.profile.variantLabel}</div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup" aria-label={t.user.profile.variantLabel}>
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
                                className={`border-b-2 pb-1 text-sm font-medium transition-colors ${
                                    selectedVariant === variant
                                        ? variant === "survival"
                                            ? "border-destructive text-foreground"
                                            : "border-primary text-foreground"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {t.leaderboard.filters.variant[variant]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-b border-border/60">
                {isLoading ? (
                    <div className="p-8 text-center" role="status">
                        {t.common.loading}
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-destructive" role="alert">
                        {error}
                    </div>
                ) : leaderboardData.length === 0 ? (
                    <div className="p-8 text-center text-foreground/70" role="status">
                        {t.leaderboard.empty}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed sm:table-auto">
                            <caption className="sr-only">{t.leaderboard.title}</caption>
                            <thead className="border-b border-border/60 text-sm text-muted-foreground">
                            <tr>
                                <th scope="col" className="w-14 px-3 py-3 text-left font-medium sm:w-auto sm:px-5 sm:py-4">{t.leaderboard.table.rank}</th>
                                <th scope="col" className="px-2 py-3 text-left font-medium sm:px-5 sm:py-4">{t.leaderboard.table.player}</th>
                                <th scope="col" className="w-24 px-3 py-3 text-right text-xs font-medium sm:w-auto sm:px-5 sm:py-4 sm:text-sm">{t.leaderboard.table.profilePp}</th>
                                <th scope="col" className="hidden px-5 py-4 text-right font-medium lg:table-cell">{t.leaderboard.table.bestRunPp}</th>
                                {selectedVariant === "survival" && (
                                    <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell sm:px-5 sm:py-4">
                                        {t.leaderboard.table.bestStreak}
                                    </th>
                                )}
                                <th scope="col" className="hidden px-5 py-4 text-right font-medium md:table-cell">{t.leaderboard.table.gamesPlayed}</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {leaderboardData.map((player, index) => (
                                    <tr key={player.bancho_id} className={`transition-colors hover:bg-muted/30 ${session?.user?.name === player.username ? "bg-primary/10" : ""}`}>
                                        <td className="px-3 py-4 sm:px-5 sm:py-5">
                                            <span className={`${index + 1 <= 3 && page === 1 ? "font-semibold text-primary" : "text-muted-foreground"} font-mono tabular-nums`}>
                                                {(page - 1) * pageSize + index + 1}
                                            </span>
                                        </td>
                                        <td className="min-w-0 px-2 py-4 sm:px-5 sm:py-5">
                                            <Link href={`/user/${player.bancho_id}`} className="group flex min-w-0 items-center gap-2 transition-colors hover:text-primary sm:gap-3">
                                                <Image
                                                    src={player.avatar_url || "/placeholder.svg"}
                                                    alt=""
                                                    width={32}
                                                    height={32}
                                                    unoptimized
                                                    className="rounded-full ring-2 ring-transparent group-hover:ring-primary/20 transition-all"
                                                />
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="truncate font-medium">{player.username}</span>
                                                    {player.badges &&
                                                        player.badges.map((badge, badgeIndex) => (
                                                            <Badge
                                                                key={badgeIndex}
                                                                variant="secondary"
                                                                className="hidden text-xs lg:inline-flex"
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
                                        <td className="px-3 py-4 text-right font-mono text-sm font-semibold tabular-nums sm:px-5 sm:py-5">
                                            {Number(player.profile_pp).toLocaleString(locale, { maximumFractionDigits: 1 })}
                                        </td>
                                        <td className="hidden px-5 py-5 text-right font-mono text-sm tabular-nums text-muted-foreground lg:table-cell">
                                            {Number(player.best_run_pp).toLocaleString(locale, { maximumFractionDigits: 1 })}
                                        </td>
                                        {selectedVariant === "survival" && (
                                            <td className="hidden px-5 py-5 text-right font-mono text-sm tabular-nums sm:table-cell">
                                                {player.highest_streak.toLocaleString(locale)}
                                            </td>
                                        )}
                                        <td className="hidden px-5 py-5 text-right font-mono text-sm tabular-nums text-muted-foreground md:table-cell">{player.games_played}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="mt-5 flex flex-col-reverse items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Page size</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                            setPageSize(Number(v));
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-9 w-20">
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
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                        {"Prev"}
                    </Button>
                    <span className="mx-2 min-w-14 text-center text-sm text-muted-foreground">Page {page}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={leaderboardData.length < pageSize}>
                        {"Next"}
                    </Button>
                </div>
            </div>

            <AdSlider />
        </div>
    );
}
