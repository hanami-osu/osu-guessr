import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Audio Guessr",
    description: "Guess osu! songs from audio clips.",
};

export default function AudioGuessr() {
    return <GamePage gameMode={GameMode.Audio} />;
}
