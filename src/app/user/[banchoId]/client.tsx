"use client";

import { Game, GameMode, UserAchievement, UserWithStats, UserRanks } from "@/actions/types";
import Image from "next/image";
import Link from "next/link";
import { GameVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import UserNotFound from "./NotFound";
import { getHighestScore } from "@/lib/user-stats";

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
    user?: UserWithStats | null;
    userGames?: Game[];
    topPlays?: Game[];
    loadError?: string | null;
}

export default function UserProfileClient({ currentMode, currentVariant, banchoId, user = null, userGames = [], topPlays = [], loadError = null }: UserProfileClientProps) {
    const { t, locale } = useTranslationsContext();

    if (loadError) {
        return (
            <div className="container mx-auto px-4 py-10 md:py-16">
                <div className="flex min-h-[400px] items-center justify-center">
                    <div className="text-center">
                        <p className="mb-4 text-destructive">Failed to load user data</p>
                        <p className="text-muted-foreground">{loadError}</p>
                        <Link href="/" className="mt-4 block text-primary hover:underline">
                            Return to home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!user) {
        return <UserNotFound />;
    }

    const userStats: UserAchievement[] = (user.achievements ?? []).filter((achievement) => achievement.variant === currentVariant);

    const defaultRanks: UserRanks = {
        globalRank: undefined,
        modeRanks: {
            [GameMode.Background]: {},
            [GameMode.Audio]: {},
            [GameMode.Skin]: {},
        },
    };

    const { username, avatar_url, achievements = [], ranks = defaultRanks } = user;

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
        <div className="container mx-auto max-w-5xl space-y-10 px-4 py-8 md:py-12">
            <div className="border-b border-border/60 pb-8">
                <div className="flex items-start gap-5 sm:items-center sm:gap-6">
                    <div className="relative h-20 w-20 shrink-0 sm:h-28 sm:w-28">
                        <Image src={avatar_url} alt={username} fill className="rounded-full object-cover" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Link
                                href={`https://osu.ppy.sh/u/${banchoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-words text-2xl font-bold tracking-tight transition-colors hover:text-primary sm:text-3xl md:text-4xl"
                            >
                                {username}
                            </Link>
                            {user.badges.map((badge, index) => (
                                <span
                                    key={index}
                                    className="border-b px-1.5 py-0.5 text-xs font-medium"
                                    style={{ color: badge.color, borderColor: `${badge.color}70` }}
                                >
                                    {badge.name}
                                </span>
                            ))}
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4 sm:mt-6 sm:gap-x-6">
                            <StatBox label={t.user.profile.stats.hiScore} value={getHighestScore(achievements).toLocaleString(locale)} />
                            <StatBox label={t.user.profile.stats.totalGames} value={achievements?.reduce((sum, a) => sum + a.games_played, 0).toLocaleString(locale) ?? "0"} />
                            <StatBox
                                label={t.user.profile.stats.globalRank}
                                value={currentVariant === "classic" ? ranks.modeRanks[currentMode].classic?.toLocaleString(locale) ?? "-" : ranks.modeRanks[currentMode].death?.toLocaleString(locale) ?? "-"}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <ProfileFilters currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} />

            <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
                <section>
                    <h2 className="mb-5 text-xl font-semibold tracking-tight capitalize">
                        {t.user.profile.gameStats.title} ({currentMode})
                    </h2>
                    <div className="border-t border-border/60 pt-5">
                        {gameStats[currentMode].games_played > 0 ? (
                            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                {currentVariant === "classic" && (
                                    <>
                                        <StatItem label={t.user.profile.gameStats.totalScore} value={gameStats[currentMode].total_score.toLocaleString(locale)} />
                                        <StatItem label={t.user.profile.gameStats.modeRank} value={ranks.modeRanks[currentMode].classic?.toLocaleString(locale) ?? "-"} />
                                    </>
                                )}
                                {currentVariant === "death" && <StatItem label={t.user.profile.gameStats.modeRank} value={ranks.modeRanks[currentMode].death?.toLocaleString(locale) ?? "-"} />}
                                <StatItem label={t.user.profile.gameStats.gamesPlayed} value={gameStats[currentMode].games_played.toString()} />
                                <StatItem
                                    label={currentVariant === "classic" ? t.user.profile.gameStats.highestScore : t.user.profile.gameStats.bestStreak}
                                    value={currentVariant === "classic" ? gameStats[currentMode].highest_score.toLocaleString(locale) : gameStats[currentMode].highest_streak.toString()}
                                />
                                <StatItem label={t.user.profile.gameStats.lastPlayed} value={gameStats[currentMode].last_played.toLocaleDateString(locale)} />
                            </div>
                        ) : (
                            <div className="py-4 text-muted-foreground">{t.user.profile.noPlays}</div>
                        )}
                    </div>
                </section>

                <section>
                    <h2 className="mb-5 text-xl font-semibold tracking-tight capitalize">
                        {t.user.profile.topGames.title} ({currentMode})
                    </h2>
                    <div className="border-t border-border/60 pt-2">
                        {topPlays.length > 0 ? (
                            <div className="divide-y divide-border/50">
                                {topPlays.map((game, index) => (
                                    <div key={index} className="flex items-center justify-between gap-4 py-3">
                                        <div className="flex min-w-0 items-baseline gap-3">
                                            <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                                            <span className="truncate font-medium">
                                                {currentVariant === "classic"
                                                    ? t.user.profile.topGames.points.replace("{points}", game.points.toLocaleString(locale))
                                                    : t.user.profile.topGames.streak.replace("{count}", game.streak.toString())}
                                            </span>
                                        </div>
                                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                                            {currentVariant === "classic" && <div>{game.streak}x</div>}
                                            <div>{new Date(game.ended_at).toLocaleDateString(locale)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-4 text-muted-foreground">{t.user.profile.noPlays}</div>
                        )}
                    </div>
                </section>
            </div>

            <section>
                <h2 className="mb-5 text-xl font-semibold tracking-tight">{t.user.profile.recentGames.title}</h2>
                <div className="border-y border-border/60">
                    {userGames.length > 0 ? (
                        <div className="divide-y divide-border/50">
                            {userGames.map((game, index) => (
                                <div key={index} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-baseline gap-3">
                                        <span className="font-medium capitalize">{game.game_mode}</span>
                                        <span className="text-sm text-muted-foreground">{new Date(game.ended_at).toLocaleDateString(locale)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                        {currentVariant === "classic" && <span className="font-medium">{t.user.profile.topGames.points.replace("{points}", game.points.toLocaleString(locale))}</span>}
                                        <span className="text-muted-foreground">{t.user.profile.topGames.streak.replace("{count}", game.streak.toString())}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-muted-foreground">{t.user.profile.recentGames.noGames}</div>
                    )}
                </div>
            </section>
        </div>
    );
}

function StatItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 font-medium tabular-nums">{value}</div>
        </div>
    );
}

function StatBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-xs text-muted-foreground sm:text-sm">{label}</div>
            <div className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
        </div>
    );
}

function ProfileFilters({ currentMode, currentVariant, banchoId }: UserProfileClientProps) {
    const { t } = useTranslationsContext();

    return (
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-10">
            <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Mode</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                {gamemodes.map((mode) => (
                    <Link
                        key={mode}
                        href={`/user/${banchoId}?mode=${mode}&variant=${currentVariant}`}
                        aria-current={currentMode === mode ? "page" : undefined}
                        className={`border-b-2 pb-1 text-sm font-medium capitalize transition-colors ${currentMode === mode ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                        {t.leaderboard.filters.mode[mode]}
                    </Link>
                ))}
                </div>
            </div>

            <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Variant</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Link
                    href={`/user/${banchoId}?mode=${currentMode}&variant=classic`}
                    aria-current={currentVariant === "classic" ? "page" : undefined}
                    className={`border-b-2 pb-1 text-sm font-medium transition-colors ${currentVariant === "classic" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    {t.leaderboard.filters.variant.classic}
                </Link>
                <Link
                    href={`/user/${banchoId}?mode=${currentMode}&variant=death`}
                    aria-current={currentVariant === "death" ? "page" : undefined}
                    className={`border-b-2 pb-1 text-sm font-medium transition-colors ${currentVariant === "death" ? "border-destructive text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                    {t.leaderboard.filters.variant.death}
                </Link>
                </div>
            </div>
        </div>
    );
}
