import { Metadata } from "next";
import UserProfileClient from "./client";
import { parseProfileFilters } from "@/lib/users/profile-params";
import { getUserByIdAction, getUserDailyStatsAction, getUserLatestGamesAction, getUserLifetimeModeStatsAction, getUserRankHistoryAction, getUserTopGamesAction } from "@/actions/user-server";
import { createPageMetadata } from "@/lib/seo/social-metadata";
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
        const rank = currentVariant === "daily" ? undefined : user.ranks?.modeRanks[currentMode]?.[currentVariant];
        const pp = Number(modeStats?.profile_pp ?? 0);
        const context = `${formatLabel(currentMode)} · ${formatLabel(currentVariant)}`;
        const performance = [rank ? `#${rank.toLocaleString("en-US")}` : null, modeStats ? `${pp.toLocaleString("en-US", { maximumFractionDigits: 1 })} pp` : null].filter(Boolean).join(" · ");
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

    try {
        const user = await getUserById(numericBanchoId);

        if (!user) {
            return <UserProfileClient currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} user={null} />;
        }

        const [dailyStats, standardStats] = await Promise.all([
            currentVariant === "daily" ? getUserDailyStatsAction(numericBanchoId, currentMode) : Promise.resolve(null),
            currentVariant === "daily"
                ? Promise.resolve(null)
                : Promise.all([
                      getUserLifetimeModeStatsAction(numericBanchoId, currentMode, currentVariant),
                      getUserTopGamesAction(numericBanchoId, currentMode, currentVariant, 100),
                      getUserLatestGamesAction(numericBanchoId, currentMode, currentVariant, 10),
                      getUserRankHistoryAction(numericBanchoId, currentMode, currentVariant),
                  ]),
        ]);

        return (
            <UserProfileClient
                currentMode={currentMode}
                currentVariant={currentVariant}
                banchoId={banchoId}
                user={user}
                lifetimeModeStats={standardStats?.[0]}
                bestScores={standardStats?.[1]}
                recentScores={standardStats?.[2]}
                rankHistory={standardStats?.[3]}
                dailyStats={dailyStats}
                generatedAt={generatedAt.toISOString()}
            />
        );
    } catch (error) {
        console.error("Failed to fetch user data:", error);
        return <UserProfileClient currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} user={null} loadError={error instanceof Error ? error.message : "Failed to load user data"} />;
    }
}
