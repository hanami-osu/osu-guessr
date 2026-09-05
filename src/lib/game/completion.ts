import type { GameState } from "@/actions/types";

interface PersistableGameState {
    variant: GameState["variant"];
    currentRound: number;
    hasGuessedCurrentRound: boolean;
}

export function isClassicGameIncomplete(gameState: GameState): boolean {
    return gameState.rounds.current < gameState.rounds.total || !gameState.currentBeatmap.revealed;
}

export function canPersistGameResult(state: PersistableGameState, maxRounds: number): boolean {
    return state.variant === "death" || (state.currentRound === maxRounds && state.hasGuessedCurrentRound);
}
