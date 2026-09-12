import { describe, expect, test } from "bun:test";
import type { GameState } from "@/actions/types";
import { canPersistGameResult, isClassicGameIncomplete } from "./completion";

const finalRound: GameState = {
    sessionId: "00000000-0000-4000-8000-000000000000",
    currentBeatmap: { revealed: false },
    score: { total: 0, current: 0, streak: 0, highestStreak: 0 },
    rounds: { current: 15, total: 15, correctGuesses: 0, totalTimeUsed: 0, mistakes: 0 },
    timeLeft: 30,
    gameStatus: "active",
    variant: "classic",
};

describe("classic game completion", () => {
    test("keeps an unanswered final round incomplete", () => {
        expect(isClassicGameIncomplete(finalRound)).toBe(true);
    });

    test("allows exit after the final round is answered", () => {
        expect(isClassicGameIncomplete({ ...finalRound, currentBeatmap: { revealed: true } })).toBe(false);
    });

    test("does not persist an unanswered final round", () => {
        expect(canPersistGameResult({ variant: "classic", currentRound: 15, hasGuessedCurrentRound: false, highestStreak: 0 }, 15)).toBe(false);
    });

    test("does not persist a death run with no cleared maps", () => {
        expect(canPersistGameResult({ variant: "death", currentRound: 1, hasGuessedCurrentRound: true, highestStreak: 0 }, 10)).toBe(false);
    });

    test("persists a death run after at least one cleared map", () => {
        expect(canPersistGameResult({ variant: "death", currentRound: 2, hasGuessedCurrentRound: true, highestStreak: 1 }, 10)).toBe(true);
    });

    test("persists a survival run after any answered map", () => {
        expect(canPersistGameResult({ variant: "survival", currentRound: 1, hasGuessedCurrentRound: true, highestStreak: 0 }, 10)).toBe(true);
    });
});
