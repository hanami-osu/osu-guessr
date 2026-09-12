"use client";

import { GameMode, type GameVariant } from "@/actions/types";
import { useRouter } from "next/navigation";
import GameAudio from "../audio/components/GameAudio";
import GameImage from "../background/components/GameImage";
import GameSkin from "../skin/components/GameSkin";
import GameScreen from "./pages/GameScreen";

const GAME_MEDIA = {
    [GameMode.Audio]: GameAudio,
    [GameMode.Background]: GameImage,
    [GameMode.Skin]: GameSkin,
};

export default function MenuManager({ gameMode, gameVariant }: { gameMode: GameMode; gameVariant: GameVariant }) {
    const router = useRouter();

    return <GameScreen onExit={() => router.replace(`/?game=${gameMode}`)} gameVariant={gameVariant} gameMode={gameMode} GameMedia={GAME_MEDIA[gameMode]} />;
}
