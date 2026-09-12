import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    ...createPageMetadata({
        title: "Background Guessr",
        description: "Guess osu! songs from beatmap backgrounds.",
        path: "/games/background",
    }),
    robots: { index: false, follow: false },
};

export default async function BackgroundGuessr({ searchParams }: { searchParams: Promise<{ variant?: string | string[] }> }) {
    const { variant } = await searchParams;
    return <GamePage gameMode={GameMode.Background} gameVariant={variant} />;
}
