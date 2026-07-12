import { GameState } from "@/actions/types";

export function getDeathEndReason(gameState: GameState): "completed" | "died" {
    return gameState.gameStatus === "finished" && gameState.lastGuess?.correct !== false ? "completed" : "died";
}
