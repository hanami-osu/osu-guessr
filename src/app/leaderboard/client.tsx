"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon } from "lucide-react";
import { getTopPlayersAction } from "@/actions/user-server";
import { GameMode, type TopPlayer } from "@/actions/types";
import type { GameVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import { AdSlider } from "@/components/Ads";
import { createLatestRequestGate } from "@/lib/latest-request";

export default function LeaderboardClient() {
    const { t } = useTranslationsContext();
    const { data: session } = useSession();
    const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.Background);
    const [selectedVariant, setSelectedVariant] = useState<GameVariant>("classic");
    const [leaderboardData, setLeaderboardData] = useState<Array<TopPlayer>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [orderMetric, setOrderMetric] = useState<"total" | "highest">("highest");
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const requestGate = useRef(createLatestRequestGate());

    const errorMessage = t.notifications.error;

    useEffect(() => {
        const request = requestGate.current.begin();

        async function fetchLeaderboard() {
            setIsLoading(true);
            setError(null);

            try {
                const offset = (page - 1) * pageSize;
                const data = await getTopPlayersAction(selectedMode, selectedVariant, pageSize, orderMetric, offset);
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
    }, [selectedMode, selectedVariant, orderMetric, page, pageSize, errorMessage]);

    const gameModes: GameMode[] = [GameMode.Background, GameMode.Audio, GameMode.Skin];

    return (
        <div className="container mx-auto px-4 py-10 md:py-16">
            <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">{t.leaderboard.title}</h1>

            <div className="flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center justify-center gap-4 mb-8 p-4 bg-card rounded-lg border border-border/60">
                <div className="flex items-center justify-between gap-2 md:justify-start">
                    <span className="text-sm font-medium text-muted-foreground">Mode:</span>
                    <Select
                        value={selectedMode}
                        onValueChange={(value: GameMode) => {
                            setSelectedMode(value);
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {gameModes.map((mode) => (
                                <SelectItem key={mode} value={mode} className="capitalize">
                                    {t.leaderboard.filters.mode[mode]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center justify-between gap-2 md:justify-start">
                    <span className="text-sm font-medium text-muted-foreground">Variant:</span>
                    <div className="flex rounded-md border border-border/60">
                        <Button
                            variant={selectedVariant === "classic" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => {
                                setSelectedVariant("classic");
                                setPage(1);
                            }}
                            className="rounded-r-none border-r"
                        >
                            {t.leaderboard.filters.variant.classic}
                        </Button>
                        <Button
                            variant={selectedVariant === "death" ? "destructive" : "ghost"}
                            size="sm"
                            onClick={() => {
                                setSelectedVariant("death");
                                setPage(1);
                            }}
                            className="rounded-l-none"
                        >
                            {t.leaderboard.filters.variant.death}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-card rounded-lg border border-border/60 overflow-hidden">
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
                            <thead className="bg-secondary/50">
                            <tr>
                                <th scope="col" className="w-14 px-3 py-3 text-left sm:w-auto sm:px-6 sm:py-4">{t.leaderboard.table.rank}</th>
                                <th scope="col" className="px-2 py-3 text-left sm:px-6 sm:py-4">{t.leaderboard.table.player}</th>
                                {selectedVariant === "classic" && (
                                    <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell sm:px-6 sm:py-4">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setOrderMetric("total");
                                                setPage(1);
                                            }}
                                            className="h-auto p-0 font-semibold hover:bg-transparent"
                                        >
                                            {t.leaderboard.table.totalScore}
                                            {orderMetric === "total" && <ChevronDownIcon className="ml-1 h-3 w-3" />}
                                        </Button>
                                    </th>
                                )}
                                <th scope="col" className="hidden px-6 py-4 text-right md:table-cell">{t.leaderboard.table.gamesPlayed}</th>
                                <th scope="col" className="w-20 px-3 py-3 text-right text-xs sm:w-auto sm:px-6 sm:py-4 sm:text-base">
                                    {selectedVariant === "classic" ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setOrderMetric("highest");
                                                setPage(1);
                                            }}
                                            className="h-auto p-0 font-semibold hover:bg-transparent"
                                        >
                                            {t.leaderboard.table.hiScore}
                                            {orderMetric === "highest" && <ChevronDownIcon className="ml-1 h-3 w-3" />}
                                        </Button>
                                    ) : (
                                        t.leaderboard.table.bestStreak
                                    )}
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {leaderboardData.map((player, index) => (
                                    <tr key={player.bancho_id} className={`hover:bg-secondary/20 transition-colors ${session?.user?.name === player.username ? "bg-primary/10" : ""}`}>
                                        <td className="px-3 py-3 sm:px-6 sm:py-4">
                                            {index + 1 <= 3 && page === 1 ? (
                                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-foreground font-bold text-sm ring-1 ring-border/70">
                                                    {(page - 1) * pageSize + index + 1}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground font-mono">{(page - 1) * pageSize + index + 1}</span>
                                            )}
                                        </td>
                                        <td className="min-w-0 px-2 py-3 sm:px-6 sm:py-4">
                                            <Link href={`/user/${player.bancho_id}`} className="group flex min-w-0 items-center gap-2 transition-colors hover:text-primary sm:gap-3">
                                                <Image
                                                    src={player.avatar_url || "/placeholder.svg"}
                                                    alt=""
                                                    width={32}
                                                    height={32}
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
                                        {selectedVariant === "classic" && <td className="hidden px-6 py-4 text-right font-mono text-sm sm:table-cell">{BigInt(player.total_score).toLocaleString()}</td>}
                                        <td className="hidden px-6 py-4 text-right font-mono text-sm text-muted-foreground md:table-cell">{player.games_played}</td>
                                        <td className="px-3 py-3 text-right font-mono text-sm font-semibold sm:px-6 sm:py-4">{selectedVariant === "classic" ? player.highest_score : player.highest_streak}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4 mt-4">
                <div className="hidden md:block" />

                <div className="flex items-center justify-center">
                    <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                        {"Prev"}
                    </Button>
                    <span className="text-sm text-muted-foreground mx-3">Page {page}</span>
                    <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={leaderboardData.length < pageSize}>
                        {"Next"}
                    </Button>
                </div>

                <div className="flex items-center justify-center md:justify-end gap-2">
                    <span className="text-sm text-muted-foreground">Page size</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                            setPageSize(Number(v));
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="w-24">
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
            </div>

            <AdSlider />
        </div>
    );
}
