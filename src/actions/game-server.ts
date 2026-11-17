"use server";

import { cookies } from "next/headers";
import { getAuthSession } from "./server";
import { GameMode, type GameRunType, type GameState } from "./types";
import type { GameVariant } from "@/app/games/config";
import { claimGuestDailyResult, endGameForUser, getDailyChallengeInfo, getDailyStatusForUser, getGameStateForUser, getGuestDailyResult, getSuggestions, startGameForUser, submitGuessForUser } from "@/lib/game/server";
import { createGuestDailyAccessToken, getGuestDailyCookieName, hasGuestDailyAccess } from "@/lib/game/guest-daily-access";

async function getActionUserId(allowGuestDaily = false): Promise<number> {
    try {
        return (await getAuthSession()).user.banchoId;
    } catch (error) {
        if (allowGuestDaily && error instanceof Error && error.message === "Unauthorized") return 0;
        throw error;
    }
}

async function requireGuestDailySessionAccess(sessionId: string): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(getGuestDailyCookieName(sessionId))?.value;
    if (!hasGuestDailyAccess(sessionId, token)) throw new Error("Game session not found or expired");
}

export async function startGameAction(gameMode: GameMode, variant: GameVariant = "classic", multiplayerLobbyCode?: string, runType: GameRunType = "standard"): Promise<GameState> {
    const userId = await getActionUserId(runType === "daily" && !multiplayerLobbyCode);
    const gameState = await startGameForUser(userId, gameMode, variant, multiplayerLobbyCode, runType);
    if (userId === 0 && runType === "daily" && !multiplayerLobbyCode) {
        const cookieStore = await cookies();
        cookieStore.set(getGuestDailyCookieName(gameState.sessionId), createGuestDailyAccessToken(gameState.sessionId), {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
        });
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
