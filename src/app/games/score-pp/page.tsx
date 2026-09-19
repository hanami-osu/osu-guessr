import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createPageMetadata } from "@/lib/social-metadata";
import type { GameVariant } from "@/actions/types";
import SignInPrompt from "../shared/SignInPrompt";
import ScorePpGame from "./components/ScorePpGame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    ...createPageMetadata({
        title: "Score pp",
        description: "Pick which osu! score is worth more performance points.",
        path: "/games/score-pp",
    }),
    robots: { index: false, follow: false },
};

function isGameVariant(value: string | undefined): value is GameVariant {
    return value === "classic" || value === "survival";
}

export default async function ScorePpPage({ searchParams }: { searchParams: Promise<{ variant?: string | string[]; lobby?: string | string[] }> }) {
    const { variant, lobby } = await searchParams;
    const selectedVariant = Array.isArray(variant) ? variant[0] : variant;
    const selectedLobby = Array.isArray(lobby) ? lobby[0] : lobby;
    if (!isGameVariant(selectedVariant)) redirect("/?game=score_pp");

    const session = await auth();
    if (!session?.user?.banchoId) return <SignInPrompt />;

    return <ScorePpGame gameVariant={selectedVariant} multiplayerLobbyCode={selectedLobby} />;
}
