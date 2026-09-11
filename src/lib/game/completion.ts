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
    return state.variant === "death" ? state.highestStreak > 0 : state.currentRound === maxRounds && state.hasGuessedCurrentRound;
}
