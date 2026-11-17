import { describe, expect, test } from "bun:test";
import type { GameState } from "@/actions/types";
import { isClassicGameIncomplete } from "@/lib/game/completion";

const finalRound: GameState = {
    sessionId: "00000000-0000-4000-8000-000000000000",
    currentBeatmap: { revealed: false },
    score: { total: 0, current: 0, streak: 0, highestStreak: 0 },
    rounds: { current: 15, total: 15, correctGuesses: 0, totalTimeUsed: 0, mistakes: 0 },
    timeLeft: 30,
    gameStatus: "active",
    runType: "standard", variant: "classic",
};

describe("classic game exit warning", () => {
    test("warns until the final round is revealed", () => {
        const answered = { ...finalRound, currentBeatmap: { revealed: true } };
        expect(isClassicGameIncomplete({ ...answered, rounds: { ...answered.rounds, current: 14 } })).toBe(true);
        expect(isClassicGameIncomplete(finalRound)).toBe(true);
        expect(isClassicGameIncomplete(answered)).toBe(false);
    });
});
