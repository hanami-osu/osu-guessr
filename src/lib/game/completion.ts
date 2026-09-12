import type { GameState } from "@/actions/types";

interface PersistableGameState {
    variant: GameState["variant"];
    currentRound: number;
    hasGuessedCurrentRound: boolean;
    highestStreak: number;
}

export function isClassicGameIncomplete(gameState: GameState): boolean {
    return gameState.rounds.current < gameState.rounds.total || !gameState.currentBeatmap.revealed;
}

export function canPersistGameResult(state: PersistableGameState, maxRounds: number): boolean {
    if (state.variant === "death") return state.highestStreak > 0;
    if (state.variant === "survival") return state.currentRound > 1 || state.hasGuessedCurrentRound;
    return state.currentRound === maxRounds && state.hasGuessedCurrentRound;
}
