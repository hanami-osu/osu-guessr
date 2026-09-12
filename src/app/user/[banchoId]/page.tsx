import { Metadata } from "next";
import UserProfileClient from "./client";
import { parseProfileFilters } from "@/lib/profile-params";
import { getUserByIdAction, getUserLatestGamesAction, getUserLifetimeModeStatsAction, getUserRankHistoryAction, getUserTopGamesAction } from "@/actions/user-server";
import { createPageMetadata } from "@/lib/social-metadata";
import { cache } from "react";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ banchoId: string }>;
    searchParams: Promise<{ mode?: string; variant?: string }>;
}

const getUserById = cache(getUserByIdAction);

function formatLabel(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const { banchoId } = await params;
    const { mode, variant } = await searchParams;
    const { mode: currentMode, variant: currentVariant } = parseProfileFilters(mode, variant);
    const numericBanchoId = Number(banchoId);
    const path = `/user/${banchoId}?mode=${currentMode}&variant=${currentVariant}`;

    if (!Number.isSafeInteger(numericBanchoId) || numericBanchoId <= 0) {
        return createPageMetadata({
            title: "User Profile",
            description: "Player statistics and pp rankings on osu!guessr.",
            path,
        });
    }

    try {
        const user = await getUserById(numericBanchoId);
        if (!user) {
            return createPageMetadata({
                title: "User Profile",
                description: "Player statistics and pp rankings on osu!guessr.",
                path,
            });
        }

        const modeStats = user.achievements?.find((achievement) => achievement.game_mode === currentMode && achievement.variant === currentVariant);
        const rank = user.ranks?.modeRanks[currentMode]?.[currentVariant];
        const pp = Number(modeStats?.profile_pp ?? 0);
        const context = `${formatLabel(currentMode)} · ${formatLabel(currentVariant)}`;
        const performance = [rank ? `#${rank.toLocaleString("en-US")}` : null, modeStats ? `${pp.toLocaleString("en-US", { maximumFractionDigits: 1 })} pp` : null]
            .filter(Boolean)
            .join(" · ");
        const description = performance ? `${context} · ${performance}` : `${context} player statistics on osu!guessr.`;

        return createPageMetadata({
            title: user.username,
            description,
            path,
            image: user.avatar_url,
            imageAlt: `${user.username}'s avatar`,
        });
    } catch {
        return createPageMetadata({
            title: "User Profile",
            description: "Player statistics and pp rankings on osu!guessr.",
            path,
        });
    }
}

export default async function UserProfile({ params, searchParams }: Props) {
    const { banchoId } = await params;
    const { mode, variant } = await searchParams;
    const { mode: currentMode, variant: currentVariant } = parseProfileFilters(mode, variant);
    const numericBanchoId = Number(banchoId);
    const generatedAt = new Date();
    const twentyFourHoursAgo = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);

    try {
        const user = await getUserById(numericBanchoId);

        if (!user) {
            return <UserProfileClient currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} user={null} />;
        }

        const [lifetimeModeStats, bestScores, recentScores, rankHistory] = await Promise.all([
            getUserLifetimeModeStatsAction(numericBanchoId, currentMode, currentVariant),
            getUserTopGamesAction(numericBanchoId, currentMode, currentVariant, 100),
            getUserLatestGamesAction(numericBanchoId, currentMode, currentVariant, 100, 0, twentyFourHoursAgo),
            getUserRankHistoryAction(numericBanchoId, currentMode, currentVariant),
        ]);

        return (
            <UserProfileClient
                currentMode={currentMode}
                currentVariant={currentVariant}
                banchoId={banchoId}
                user={user}
                lifetimeModeStats={lifetimeModeStats}
                bestScores={bestScores}
                recentScores={recentScores}
                rankHistory={rankHistory}
                generatedAt={generatedAt.toISOString()}
            />
        );
    } catch (error) {
        console.error("Failed to fetch user data:", error);
        return (
            <UserProfileClient
                currentMode={currentMode}
                currentVariant={currentVariant}
                banchoId={banchoId}
                user={null}
                loadError={error instanceof Error ? error.message : "Failed to load user data"}
            />
        );
    }
}
