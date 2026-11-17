"use server";

import { getAuthSession } from "./server";
import { GameMode, type GameRunType, type GameState } from "./types";
import type { GameVariant } from "@/app/games/config";
import { beginDailyGameForUser, claimGuestDailyResult, endGameForUser, getDailyChallengeInfo, getDailyStatusForUser, getGameStateForUser, getGuestDailyResult, getSuggestions, startGameForUser, submitGuessForUser } from "@/lib/game/server";
import { requireGuestDailySessionAccess, setGuestDailySessionAccess } from "@/lib/game/guest-daily-access";

async function getActionUserId(allowGuestDaily = false): Promise<number> {
    try {
        return (await getAuthSession()).user.banchoId;
    } catch (error) {
        if (allowGuestDaily && error instanceof Error && error.message === "Unauthorized") return 0;
        throw error;
    }
}

export async function startGameAction(gameMode: GameMode, variant: GameVariant = "classic", multiplayerLobbyCode?: string, runType: GameRunType = "standard"): Promise<GameState> {
    const userId = await getActionUserId(runType === "daily" && !multiplayerLobbyCode);
    const gameState = await startGameForUser(userId, gameMode, variant, multiplayerLobbyCode, runType);
    if (userId === 0 && runType === "daily" && !multiplayerLobbyCode) {
        await setGuestDailySessionAccess(gameState.sessionId);
    }
    return gameState;
}

export async function getDailyChallengeInfoAction() {
    return getDailyChallengeInfo();
}

export async function getDailyStatusAction(gameMode: GameMode) {
    const session = await getAuthSession();
    return getDailyStatusForUser(session.user.banchoId, gameMode);
}

export async function getGuestDailyResultAction(sessionId: string) {
    await requireGuestDailySessionAccess(sessionId);
    return getGuestDailyResult(sessionId);
}

export async function claimGuestDailyResultAction(sessionId: string) {
    const userId = await getActionUserId();
    await requireGuestDailySessionAccess(sessionId);
    return claimGuestDailyResult(userId, sessionId);
}

export async function submitGuessAction(sessionId: string, guess?: string | null): Promise<GameState> {
    const userId = await getActionUserId(true);
    if (userId === 0) await requireGuestDailySessionAccess(sessionId);
    return submitGuessForUser(userId, sessionId, guess);
}

export async function getGameStateAction(sessionId: string): Promise<GameState> {
    const userId = await getActionUserId(true);
    if (userId === 0) await requireGuestDailySessionAccess(sessionId);
    return getGameStateForUser(userId, sessionId);
}

export async function endGameAction(sessionId: string) {
    const userId = await getActionUserId(true);
    if (userId === 0) await requireGuestDailySessionAccess(sessionId);
    return endGameForUser(userId, sessionId);
}

export async function getSuggestionsAction(str: string, gamemode: GameMode) {
    try {
        await getAuthSession();
    } catch {
        // Guest Daily sessions still need suggestion autocompletion without a signed-in user.
    }
    return getSuggestions(str, gamemode);
}


export async function beginDailyGameAction(sessionId: string): Promise<GameState> {
    const userId = await getActionUserId(true);
    if (userId === 0) await requireGuestDailySessionAccess(sessionId);
    return beginDailyGameForUser(userId, sessionId);
}
