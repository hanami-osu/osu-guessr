import type { GameState } from "@/actions/types";
import { isContinuousVariant } from "@/app/games/config";

interface PersistableGameState {
    variant: GameState["variant"];
    currentRound: number;
    hasGuessedCurrentRound: boolean;
}

export function isClassicGameIncomplete(gameState: GameState): boolean {
    return gameState.rounds.current < gameState.rounds.total || !gameState.currentBeatmap.revealed;
}

export function canPersistGameResult(state: PersistableGameState, maxRounds: number): boolean {
    if (isContinuousVariant(state.variant)) return state.currentRound > 1 || state.hasGuessedCurrentRound;
    return state.currentRound === maxRounds && state.hasGuessedCurrentRound;
}
