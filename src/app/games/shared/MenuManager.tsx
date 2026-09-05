"use client";

import { useState } from "react";
import { GameMode, type GameVariant } from "@/actions/types";
import GameAudio from "../audio/components/GameAudio";
import GameImage from "../background/components/GameImage";
import GameSkin from "../skin/components/GameSkin";
import PreGameMenu from "./pages/PreGameMenu";
import GameScreen from "./pages/GameScreen";

const GAME_MEDIA = {
    [GameMode.Audio]: GameAudio,
    [GameMode.Background]: GameImage,
    [GameMode.Skin]: GameSkin,
};

export default function MenuManager({ gameMode }: { gameMode: GameMode }) {
    const [selectedVariant, setSelectedVariant] = useState<GameVariant | null>(null);

    if (!selectedVariant) {
        return <PreGameMenu onStart={setSelectedVariant} gameMode={gameMode} />;
    }

    return <GameScreen onExit={() => setSelectedVariant(null)} gameVariant={selectedVariant} gameMode={gameMode} GameMedia={GAME_MEDIA[gameMode]} />;
}
