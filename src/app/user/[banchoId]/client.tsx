"use client";

import { useEffect, useRef, useState } from "react";
import { Game, GameMode, UserAchievement, UserWithStats, UserRanks } from "@/actions/types";
import { getUserByIdAction, getUserStatsAction, getUserLatestGamesAction, getUserTopGamesAction } from "@/actions/user-server";
import Image from "next/image";
import Link from "next/link";
import { GameVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import UserNotFound from "./NotFound";
import { getHighestScore } from "@/lib/user-stats";
import { createLatestRequestGate } from "@/lib/latest-request";

interface GameStats {
    game_mode: GameMode;
    total_score: bigint;
    games_played: number;
    highest_streak: number;
    highest_score: number;
    last_played: Date;
}

const gamemodes: Array<GameMode> = [GameMode.Audio, GameMode.Background, GameMode.Skin];

interface UserProfileClientProps {
    currentMode: GameMode;
    currentVariant: GameVariant;
    banchoId: string;
}

export default function UserProfileClient({ currentMode, currentVariant, banchoId }: UserProfileClientProps) {
    const { t } = useTranslationsContext();

    const [user, setUser] = useState<UserWithStats | null>(null);
    const [userStats, setUserStats] = useState<UserAchievement[]>([]);
    const [userGames, setUserGames] = useState<Game[]>([]);
    const [topPlays, setTopPlays] = useState<Game[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const requestGate = useRef(createLatestRequestGate());

    useEffect(() => {
        const request = requestGate.current.begin();

        const fetchUserData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // First fetch the user to check if they exist
                const userData = await getUserByIdAction(Number(banchoId));

                if (!userData) {
                    if (request.isCurrent()) {
                        setUser(null);
                        setError("User not found");
                    }
                    return;
                }

                // Then fetch all other data in parallel
                const [statsData, gamesData, topPlaysData] = await Promise.all([
                    getUserStatsAction(Number(banchoId)),
                    getUserLatestGamesAction(Number(banchoId), undefined, currentVariant),
                    getUserTopGamesAction(Number(banchoId), undefined, currentVariant),
                ]);

                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const filteredGames = gamesData.filter((x) => new Date(x.ended_at) > twentyFourHoursAgo);

                if (request.isCurrent()) {
                    setUser(userData);
                    setUserStats(statsData);
                    setUserGames(filteredGames);
                    setTopPlays(topPlaysData);
                }
            } catch (err) {
                if (request.isCurrent()) {
                    console.error("Failed to fetch user data:", err);
                    setError(err instanceof Error ? err.message : "Failed to load user data");
                }
            } finally {
                if (request.isCurrent()) {
                    setIsLoading(false);
                }
            }
        };

        void fetchUserData();
        return () => request.cancel();
    }, [banchoId, currentMode, currentVariant]);

    if (isLoading) {
        return <UserProfileSkeleton currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} />;
    }

    if (error || !user) {
        if (error === "User not found" || !user) {
            return <UserNotFound />;
        }

        return (
            <div className="container mx-auto px-4 py-10 md:py-16">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <p className="text-destructive mb-4">Failed to load user data</p>
                        <p className="text-muted-foreground">{error}</p>
                        <Link href="/" className="text-primary hover:underline mt-4 block">
                            Return to home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const defaultRanks: UserRanks = {
        globalRank: undefined,
        modeRanks: {
            [GameMode.Background]: {},
            [GameMode.Audio]: {},
            [GameMode.Skin]: {},
        },
    };

    const { username, avatar_url, achievements = [], ranks = defaultRanks } = user;

    const topPlaysByMode = topPlays.reduce((acc, game) => {
        if (!acc[game.game_mode]) {
            acc[game.game_mode] = [];
        }
        acc[game.game_mode].push(game);
        return acc;
    }, {} as Record<GameMode, Array<Game>>);

    const gameStats: Record<GameMode, GameStats> = {
        [GameMode.Background]: {
            game_mode: GameMode.Background,
            total_score: 0n,
            games_played: 0,
            highest_streak: 0,
            highest_score: 0,
            last_played: new Date(0),
        },
        [GameMode.Audio]: {
            game_mode: GameMode.Audio,
            total_score: 0n,
            games_played: 0,
            highest_streak: 0,
            highest_score: 0,
            last_played: new Date(0),
        },
        [GameMode.Skin]: {
            game_mode: GameMode.Skin,
            total_score: 0n,
            games_played: 0,
            highest_streak: 0,
            highest_score: 0,
            last_played: new Date(0),
        },
    };

    userStats.forEach((stat) => {
        if (stat.game_mode) {
            gameStats[stat.game_mode] = {
                game_mode: stat.game_mode,
                total_score: stat.total_score,
                games_played: stat.games_played,
                highest_streak: stat.highest_streak,
                highest_score: stat.highest_score,
                last_played: new Date(stat.last_played),
            };
        }
    });

    return (
        <div className="container mx-auto px-4 py-8 md:py-10 space-y-8 max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 bg-card p-5 sm:p-8 rounded-lg border border-border/60">
                <div className="relative h-28 w-28 sm:h-32 sm:w-32 shrink-0">
                    <Image src={avatar_url} alt={username} fill className="rounded-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-3 mb-2 sm:flex-row sm:items-center sm:flex-wrap">
                        <Link href={`https://osu.ppy.sh/u/${banchoId}`} target="_blank" rel="noopener noreferrer" className="text-3xl md:text-4xl font-bold hover:text-primary transition-colors break-words">
                            {username}
                        </Link>
                        <div className="flex flex-wrap gap-2">
                            {user.badges.map((badge, index) => (
                                <span
                                    key={index}
                                    className="px-2 py-1 rounded text-sm border"
                                    style={{
                                        backgroundColor: `${badge.color}10`,
                                        color: badge.color,
                                        borderColor: `${badge.color}30`,
                                    }}
                                >
                                    {badge.name}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                        <StatBox label={t.user.profile.stats.hiScore} value={getHighestScore(achievements).toLocaleString()} />
                        <StatBox label={t.user.profile.stats.totalGames} value={achievements?.reduce((sum, a) => sum + a.games_played, 0).toLocaleString() ?? "0"} />
                        <StatBox
                            label={t.user.profile.stats.globalRank}
                            value={currentVariant === "classic" ? ranks.modeRanks[currentMode].classic?.toLocaleString() ?? "-" : ranks.modeRanks[currentMode].death?.toLocaleString() ?? "-"}
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center gap-4">
                <div className="flex w-full flex-wrap justify-center gap-3">
                    {gamemodes.map((mode) => (
                        <Link
                            key={mode}
                            href={`/user/${banchoId}?mode=${mode}&variant=${currentVariant}`}
                            className={`px-4 py-2 rounded-lg capitalize border border-border/60 ${currentMode === mode ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-primary/10"}`}
                        >
                            {t.leaderboard.filters.mode[mode]}
                        </Link>
                    ))}
                </div>

                <div className="flex w-full flex-col justify-center gap-3 sm:flex-row">
                    <Link
                        href={`/user/${banchoId}?mode=${currentMode}&variant=classic`}
                        className={`min-w-[120px] text-center px-4 py-2 rounded-lg border border-border/60 ${currentVariant === "classic" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-primary/10"}`}
                    >
                        {t.leaderboard.filters.variant.classic}
                    </Link>
                    <Link
                        href={`/user/${banchoId}?mode=${currentMode}&variant=death`}
                        className={`min-w-[120px] text-center px-4 py-2 rounded-lg border border-border/60 ${
                            currentVariant === "death" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive" : "bg-card hover:bg-destructive/10 hover:text-destructive"
                        }`}
                    >
                        {t.leaderboard.filters.variant.death}
                    </Link>
                </div>
            </div>

            <section>
                <h2 className="text-2xl font-bold mb-6 text-center capitalize">
                    {t.user.profile.gameStats.title} ({currentMode})
                </h2>
                <div className="bg-card p-5 sm:p-6 rounded-lg border border-border/60">
                    {gameStats[currentMode].games_played > 0 ? (
                        <div className="space-y-4">
                            {currentVariant === "classic" && (
                                <>
                                    <StatItem label={t.user.profile.gameStats.totalScore} value={gameStats[currentMode].total_score.toLocaleString()} />
                                    <StatItem label={t.user.profile.gameStats.modeRank} value={ranks.modeRanks[currentMode].classic?.toLocaleString() ?? "-"} />
                                </>
                            )}
                            {currentVariant === "death" && <StatItem label={t.user.profile.gameStats.modeRank} value={ranks.modeRanks[currentMode].death?.toLocaleString() ?? "-"} />}
                            <StatItem label={t.user.profile.gameStats.gamesPlayed} value={gameStats[currentMode].games_played.toString()} />
                            <StatItem
                                label={currentVariant === "classic" ? t.user.profile.gameStats.highestScore : t.user.profile.gameStats.bestStreak}
                                value={currentVariant === "classic" ? gameStats[currentMode].highest_score.toLocaleString() : gameStats[currentMode].highest_streak.toString()}
                            />
                            <StatItem label={t.user.profile.gameStats.lastPlayed} value={gameStats[currentMode].last_played.toLocaleDateString()} />
                        </div>
                    ) : (
                        <div className="text-center py-4 text-foreground/70">{t.user.profile.noPlays}</div>
                    )}
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-6 text-center capitalize">
                    {t.user.profile.topGames.title} ({currentMode})
                </h2>
                <div className="bg-card p-5 sm:p-6 rounded-lg border border-border/60">
                    <div className="space-y-4">
                        {topPlaysByMode[currentMode]?.slice(0, 5).map((game, index) => (
                            <div key={index} className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                                <div className="flex items-center gap-2">
                                    <span className="text-foreground/70">#{index + 1}</span>
                                    {currentVariant === "classic" ? (
                                        <span>{t.user.profile.topGames.points.replace("{points}", game.points.toLocaleString())}</span>
                                    ) : (
                                        <span>{t.user.profile.topGames.streak.replace("{count}", game.streak.toString())}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-foreground/70">
                                    {currentVariant === "classic" && <span>{game.streak}x</span>}
                                    <span>{new Date(game.ended_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                        {(!topPlaysByMode[currentMode] || topPlaysByMode[currentMode].length === 0) && <div className="text-center py-4 text-foreground/70">{t.user.profile.noPlays}</div>}
                    </div>
                </div>
            </section>

            {/* Recent Games */}
            <section>
                <h2 className="text-2xl font-bold mb-6 text-center">{t.user.profile.recentGames.title}</h2>
                <div className="bg-card rounded-lg border border-border/60">
                    {userGames.length > 0 ? (
                        <div className="divide-y divide-border/50">
                            {userGames.map((game, index) => (
                                <div key={index} className="p-4 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                                    <div>
                                        <span className="font-medium capitalize">{game.game_mode} Mode</span>
                                        <span className="text-foreground/70 ml-4">{new Date(game.ended_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {currentVariant === "classic" && <span className="font-semibold">{t.user.profile.topGames.points.replace("{points}", game.points.toLocaleString())}</span>}
                                        <span className="font-semibold">{t.user.profile.topGames.streak.replace("{count}", game.streak.toString())}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <h3 className="text-center text-foreground/70 py-4">{t.user.profile.recentGames.noGames}</h3>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function StatItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center gap-4">
            <span className="text-foreground/70">{label}</span>
            <span className="font-medium text-right">{value}</span>
        </div>
    );
}

function StatBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-background/50 p-3 rounded-lg border border-border/50">
            <div className="text-sm text-foreground/70">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
        </div>
    );
}

function UserProfileSkeleton({ currentMode, currentVariant, banchoId }: { currentMode: GameMode; currentVariant: GameVariant; banchoId: string }) {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto px-4 py-8 md:py-10 space-y-8 max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 bg-card p-5 sm:p-8 rounded-lg border border-border/60">
                <div className="relative h-32 w-32">
                    <div className="h-32 w-32 bg-muted rounded-full animate-pulse" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="h-10 w-48 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-background/50 p-3 rounded-lg">
                                <div className="h-4 w-16 bg-muted rounded animate-pulse mb-2" />
                                <div className="h-6 w-12 bg-muted rounded animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center gap-4">
                <div className="flex justify-center gap-4">
                    {gamemodes.map((mode) => (
                        <Link
                            key={mode}
                            href={`/user/${banchoId}?mode=${mode}&variant=${currentVariant}`}
                            className={`px-4 py-2 rounded-lg capitalize border border-border/60 ${currentMode === mode ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-primary/10"}`}
                        >
                            {t.leaderboard.filters.mode[mode]}
                        </Link>
                    ))}
                </div>

                <div className="flex justify-center gap-4">
                    <Link
                        href={`/user/${banchoId}?mode=${currentMode}&variant=classic`}
                        className={`min-w-[120px] text-center px-4 py-2 rounded-lg border border-border/60 ${currentVariant === "classic" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-primary/10"}`}
                    >
                        {t.leaderboard.filters.variant.classic}
                    </Link>
                    <Link
                        href={`/user/${banchoId}?mode=${currentMode}&variant=death`}
                        className={`min-w-[120px] text-center px-4 py-2 rounded-lg border border-border/60 ${
                            currentVariant === "death" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive" : "bg-card hover:bg-destructive/10 hover:text-destructive"
                        }`}
                    >
                        {t.leaderboard.filters.variant.death}
                    </Link>
                </div>
            </div>

            <section>
                <h2 className="text-2xl font-bold mb-6 text-center capitalize">
                    {t.user.profile.gameStats.title} ({currentMode})
                </h2>
                <div className="bg-card p-5 sm:p-6 rounded-lg border border-border/60">
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-6 text-center capitalize">
                    {t.user.profile.topGames.title} ({currentMode})
                </h2>
                <div className="bg-card p-5 sm:p-6 rounded-lg border border-border/60">
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-6 bg-muted rounded animate-pulse" />
                                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                </div>
                                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-6 text-center">{t.user.profile.recentGames.title}</h2>
                <div className="bg-card rounded-lg border border-border/60">
                    <div className="divide-y divide-border/50">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="p-4 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="h-4 w-12 bg-muted rounded animate-pulse" />
                                    <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
