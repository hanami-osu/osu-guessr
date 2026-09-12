import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    ...createPageMetadata({
        title: "Skin Guessr",
        description: "Guess osu! skins from screenshots.",
        path: "/games/skin",
        image: "/skin-mode.webp",
        imageAlt: "osu!guessr skin mode",
        imageWidth: 1920,
        imageHeight: 1080,
        largeImage: true,
    }),
    robots: { index: false, follow: false },
};

export default async function SkinGuessr({ searchParams }: { searchParams: Promise<{ variant?: string | string[] }> }) {
    const { variant } = await searchParams;
    return <GamePage gameMode={GameMode.Skin} gameVariant={variant} />;
}
