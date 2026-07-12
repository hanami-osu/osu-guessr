import { describe, expect, test } from "bun:test";
import { GameState } from "@/actions/types";
import { getDeathEndReason } from "./result";

const finishedState: GameState = {
    sessionId: "00000000-0000-4000-8000-000000000000",
    currentBeatmap: { revealed: true },
    score: { total: 0, current: 0, streak: 0, highestStreak: 3 },
    rounds: { current: 4, total: 4, correctGuesses: 3, totalTimeUsed: 20 },
    timeLeft: 0,
    gameStatus: "finished",
    variant: "death",
};

describe("getDeathEndReason", () => {
    test("marks an incorrect terminal answer as a failed run", () => {
        expect(getDeathEndReason({ ...finishedState, lastGuess: { correct: false, answer: "answer", type: "guess" } })).toBe("died");
    });

    test("marks content exhaustion after a correct answer as completion", () => {
        expect(getDeathEndReason({ ...finishedState, lastGuess: { correct: true, answer: "answer", type: "guess" } })).toBe("completed");
    });

    test("marks a manually ended active run as failed", () => {
        expect(getDeathEndReason({ ...finishedState, gameStatus: "active" })).toBe("died");
    });
});
