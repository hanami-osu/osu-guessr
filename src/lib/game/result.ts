import { GameState } from "@/actions/types";

export function getDeathEndReason(gameState: GameState): "completed" | "died" | "ended" {
    if (gameState.gameStatus === "active") return "ended";
    return gameState.gameStatus === "finished" && gameState.lastGuess?.correct !== false ? "completed" : "died";
}
