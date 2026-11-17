"use server";

import { authenticatedAction } from "./server";
import type { GameRunType, GameVariant } from "./types";
import type { ScorePpRoundLoad, ScorePpRunState } from "@/lib/score-pp/types";
import { endScorePpRunForUser, getScorePpRoundForUser, getScorePpRunStateForUser, startScorePpRunForUser, submitScorePpGuessForUser } from "@/lib/score-pp/server";

export async function startScorePpRunAction(variant: GameVariant, multiplayerLobbyCode?: string, runType: GameRunType = "standard"): Promise<string> {
    try {
        return await authenticatedAction((session) => startScorePpRunForUser(session.user.banchoId, variant, multiplayerLobbyCode, runType));
    } catch (error) {
        if (runType === "daily" && !multiplayerLobbyCode && error instanceof Error && error.message === "Unauthorized") {
            return startScorePpRunForUser(0, variant, undefined, "daily");
        }
        throw error;
    }
}

export async function getScorePpRoundAction(sessionId: string, round: number, exclusions: { scoreIds: string[]; userIds: number[]; beatmapIds: number[] }): Promise<ScorePpRoundLoad> {
    try {
        return await authenticatedAction((session) => getScorePpRoundForUser(session.user.banchoId, sessionId, round, exclusions));
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") return getScorePpRoundForUser(0, sessionId, round, exclusions);
        throw error;
    }
}

export async function getScorePpRunStateAction(sessionId: string): Promise<ScorePpRunState> {
    try {
        return await authenticatedAction((session) => getScorePpRunStateForUser(session.user.banchoId, sessionId));
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") return getScorePpRunStateForUser(0, sessionId);
        throw error;
    }
}

export async function endScorePpRunAction(sessionId: string): Promise<import("@/lib/score-pp/types").ScorePpRunEndResult> {
    try {
        return await authenticatedAction((session) => endScorePpRunForUser(session.user.banchoId, sessionId));
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") return endScorePpRunForUser(0, sessionId);
        throw error;
    }
}

export async function submitScorePpGuessAction(sessionId: string, pairId: number, selectedScoreId: string | null, submissionType: "guess" | "skip" | "timeout") {
    try {
        return await authenticatedAction((session) => submitScorePpGuessForUser(session.user.banchoId, sessionId, pairId, selectedScoreId, submissionType));
    } catch (error) {
        if (error instanceof Error && error.message === "Unauthorized") return submitScorePpGuessForUser(0, sessionId, pairId, selectedScoreId, submissionType);
        throw error;
    }
}
