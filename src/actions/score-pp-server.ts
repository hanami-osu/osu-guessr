"use server";

import { authenticatedAction } from "./server";
import type { GameVariant } from "./types";
import type { ScorePpRoundLoad, ScorePpRunState } from "@/lib/score-pp/types";
import {
    endScorePpRunForUser,
    getScorePpRoundForUser,
    getScorePpRunStateForUser,
    startScorePpRunForUser,
    submitScorePpGuessForUser,
} from "@/lib/score-pp/server";

export async function startScorePpRunAction(variant: GameVariant, multiplayerLobbyCode?: string) {
    return authenticatedAction((session) => startScorePpRunForUser(session.user.banchoId, variant, multiplayerLobbyCode));
}

export async function getScorePpRoundAction(
    sessionId: string,
    round: number,
    exclusions: { scoreIds: string[]; userIds: number[]; beatmapIds: number[] },
): Promise<ScorePpRoundLoad> {
    return authenticatedAction((session) => getScorePpRoundForUser(session.user.banchoId, sessionId, round, exclusions));
}

export async function getScorePpRunStateAction(sessionId: string): Promise<ScorePpRunState> {
    return authenticatedAction((session) => getScorePpRunStateForUser(session.user.banchoId, sessionId));
}

export async function endScorePpRunAction(sessionId: string) {
    return authenticatedAction((session) => endScorePpRunForUser(session.user.banchoId, sessionId));
}

export async function submitScorePpGuessAction(sessionId: string, pairId: number, selectedScoreId: string | null, submissionType: "guess" | "skip" | "timeout") {
    return authenticatedAction((session) => submitScorePpGuessForUser(session.user.banchoId, sessionId, pairId, selectedScoreId, submissionType));
}
