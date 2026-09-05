import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Background Guessr",
    description: "Test your knowledge by guessing songs from their beatmap backgrounds.",
};

export default function BackgroundGuessr() {
    return <GamePage gameMode={GameMode.Background} />;
}
