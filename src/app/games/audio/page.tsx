import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    ...createPageMetadata({
        title: "Audio Guessr",
        description: "Guess osu! songs from audio clips.",
        path: "/games/audio",
        image: "/audio-mode.webp",
        imageAlt: "osu!guessr audio mode",
        imageWidth: 2800,
        imageHeight: 1800,
        largeImage: true,
    }),
    robots: { index: false, follow: false },
};

export default async function AudioGuessr({ searchParams }: { searchParams: Promise<{ variant?: string | string[] }> }) {
    const { variant } = await searchParams;
    return <GamePage gameMode={GameMode.Audio} gameVariant={variant} />;
}
