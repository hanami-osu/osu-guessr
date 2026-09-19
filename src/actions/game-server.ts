"use server";

import { getAuthSession } from "./server";
import { GameMode, type GameState } from "./types";
import type { GameVariant } from "@/app/games/config";
import { endGameForUser, getGameStateForUser, getSuggestions, startGameForUser, submitGuessForUser } from "@/lib/game/server";

export async function startGameAction(gameMode: GameMode, variant: GameVariant = "classic", multiplayerLobbyCode?: string): Promise<GameState> {
    const session = await getAuthSession();
    return startGameForUser(session.user.banchoId, gameMode, variant, multiplayerLobbyCode);
}

export async function submitGuessAction(sessionId: string, guess?: string | null): Promise<GameState> {
    const session = await getAuthSession();
    return submitGuessForUser(session.user.banchoId, sessionId, guess);
}

export async function getGameStateAction(sessionId: string): Promise<GameState> {
    const session = await getAuthSession();
    return getGameStateForUser(session.user.banchoId, sessionId);
}

export async function endGameAction(sessionId: string) {
    const session = await getAuthSession();
    return endGameForUser(session.user.banchoId, sessionId);
}

export async function getSuggestionsAction(str: string, gamemode: GameMode) {
    await getAuthSession();
    return getSuggestions(str, gamemode);
}
