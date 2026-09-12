import { GameState } from "@/actions/types";
import { SURVIVAL_FAILURE_MISTAKES } from "@/app/games/config";

export function getDeathEndReason(gameState: GameState): "completed" | "died" | "ended" {
    if (gameState.gameStatus === "active") return "ended";
    return gameState.gameStatus === "finished" && gameState.lastGuess?.correct !== false ? "completed" : "died";
}

export function getSurvivalEndReason(gameState: GameState): "completed" | "died" | "ended" {
    if (gameState.gameStatus === "active") return "ended";
    return gameState.rounds.mistakes >= SURVIVAL_FAILURE_MISTAKES ? "died" : "completed";
}
