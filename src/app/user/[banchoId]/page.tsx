import { Metadata } from "next";
import UserProfileClient from "./client";
import { parseProfileFilters } from "@/lib/profile-params";
import { getUserByIdAction, getUserLatestGamesAction, getUserTopGamesAction } from "@/actions/user-server";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ banchoId: string }>;
    searchParams: Promise<{ mode?: string; variant?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "User Profile",
        description: `Player statistics and achievements on osu!guessr`,
    };
}

export default async function UserProfile({ params, searchParams }: Props) {
    const { banchoId } = await params;
    const { mode, variant } = await searchParams;
    const { mode: currentMode, variant: currentVariant } = parseProfileFilters(mode, variant);
    const numericBanchoId = Number(banchoId);

    try {
        const user = await getUserByIdAction(numericBanchoId);

        if (!user) {
            return <UserProfileClient currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} user={null} userGames={[]} topPlays={[]} />;
        }

        const [games, topPlays] = await Promise.all([
            getUserLatestGamesAction(numericBanchoId, undefined, currentVariant, 100),
            getUserTopGamesAction(numericBanchoId, currentMode, currentVariant, 5),
        ]);
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const userGames = games.filter((game) => new Date(game.ended_at) > twentyFourHoursAgo);

        return <UserProfileClient currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} user={user} userGames={userGames} topPlays={topPlays} />;
    } catch (error) {
        console.error("Failed to fetch user data:", error);
        return (
            <UserProfileClient
                currentMode={currentMode}
                currentVariant={currentVariant}
                banchoId={banchoId}
                user={null}
                userGames={[]}
                topPlays={[]}
                loadError={error instanceof Error ? error.message : "Failed to load user data"}
            />
        );
    }
}
