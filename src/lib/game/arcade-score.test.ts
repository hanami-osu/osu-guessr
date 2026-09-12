import { describe, expect, test } from "bun:test";
import { calculateArcadeScore, calculateArcadeScoreFromRound } from "./arcade-score";

describe("arcade score", () => {
    test("uses the classic base, time, and streak formula", () => {
        expect(calculateArcadeScore(true, 25, 2)).toBe(200);
        expect(calculateArcadeScore(false, 25, 2)).toBe(-50);
    });

    test("reconstructs the original integer timer value from stored millisecond timing", () => {
        expect(
            calculateArcadeScoreFromRound({
                correct: true,
                responseTimeMs: 5001,
                timeLimitMs: 30_000,
                streakBefore: 0,
            }),
        ).toBe(150);
    });
});
