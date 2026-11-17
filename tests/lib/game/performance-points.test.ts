import { describe, expect, test } from "bun:test";
import { calculateEmpiricalDifficulty, calculateProfilePp, calculateRunPp, type PerformanceRound } from "@/lib/game/performance-points";

function round(overrides: Partial<PerformanceRound> = {}): PerformanceRound {
    return {
        correct: true,
        response_time_ms: 10_000,
        time_limit_ms: 30_000,
        difficulty_snapshot: 1,
        ...overrides,
    };
}

const easyItem = { appearances: 200, correct_count: 190, total_response_time_ms: 800_000 };
const hardItem = { appearances: 200, correct_count: 20, total_response_time_ms: 4_800_000 };

describe("performance points", () => {
    test("rewards accuracy, speed, and item difficulty in classic", () => {
        const baseline = Array.from({ length: 10 }, () => round());
        const faster = baseline.map(() => round({ response_time_ms: 3_000 }));
        const harder = baseline.map(() => round({ item_stats: hardItem }));
        const miss = baseline.map((value, index) => (index === 0 ? round({ correct: false, response_time_ms: 30_000 }) : value));

        expect(calculateRunPp(baseline, "classic")).toBe(100);
        expect(calculateRunPp(faster, "classic")).toBeGreaterThan(calculateRunPp(baseline, "classic"));
        expect(calculateRunPp(harder, "classic")).toBeGreaterThan(calculateRunPp(baseline, "classic"));
        expect(calculateRunPp(miss, "classic")).toBeLessThan(calculateRunPp(baseline, "classic"));
    });

    test("keeps separating classic players past a perfect run on easy content", () => {
        const perfectEasy = Array.from({ length: 15 }, () => round({ response_time_ms: 1_000, item_stats: easyItem }));
        const perfectHard = Array.from({ length: 15 }, () => round({ response_time_ms: 5_000, item_stats: hardItem }));
        const oneHardCorrect = [round({ item_stats: hardItem }), ...Array.from({ length: 14 }, () => round({ item_stats: easyItem }))];
        const allEasyCorrect = Array.from({ length: 15 }, () => round({ item_stats: easyItem }));

        expect(calculateRunPp(perfectHard, "classic")).toBeGreaterThan(2 * calculateRunPp(perfectEasy, "classic"));
        expect(calculateRunPp(oneHardCorrect, "classic")).toBeGreaterThan(calculateRunPp(allEasyCorrect, "classic"));
    });

    test("rewards longer survival runs", () => {
        const shortSurvival = [...Array.from({ length: 5 }, () => round()), round({ correct: false })];
        const longSurvival = [...Array.from({ length: 20 }, () => round()), round({ correct: false })];

        expect(calculateRunPp(longSurvival, "survival")).toBeGreaterThan(calculateRunPp(shortSurvival, "survival"));
    });

    test("scores a quit and a three-life failure equally when their correct rounds match", () => {
        const correctRounds = Array.from({ length: 5 }, () => round());
        const quit = correctRounds;
        const failed = [...correctRounds, ...Array.from({ length: 3 }, () => round({ correct: false }))];

        expect(calculateRunPp(quit, "survival")).toBe(23.006);
        expect(calculateRunPp(quit, "survival")).toBe(calculateRunPp(failed, "survival"));
    });

    test("does not lower survival PP when a slow, easier correct round is appended", () => {
        const twentyCorrect = Array.from({ length: 20 }, () => round({ difficulty_snapshot: 1.5 }));
        const twentyOneCorrect = [...twentyCorrect, round({ response_time_ms: 30_000, difficulty_snapshot: 0.75 })];

        expect(calculateRunPp(twentyOneCorrect, "survival")).toBeGreaterThanOrEqual(calculateRunPp(twentyCorrect, "survival"));
    });

    test("ranks death runs by streak first and by speed and difficulty only between equal streaks", () => {
        const slowTen = [...Array.from({ length: 10 }, () => round({ response_time_ms: 29_000, difficulty_snapshot: 0.75 })), round({ correct: false })];
        const fastNine = [...Array.from({ length: 9 }, () => round({ response_time_ms: 500, difficulty_snapshot: 1.5 })), round({ correct: false })];
        const fastTen = Array.from({ length: 10 }, () => round({ response_time_ms: 500 }));
        const hardTen = Array.from({ length: 10 }, () => round({ response_time_ms: 29_000, difficulty_snapshot: 1.5 }));

        expect(calculateRunPp(slowTen, "death")).toBeGreaterThan(calculateRunPp(fastNine, "death"));
        expect(calculateRunPp(fastTen, "death")).toBeGreaterThan(calculateRunPp(slowTen, "death"));
        expect(calculateRunPp(hardTen, "death")).toBeGreaterThan(calculateRunPp(slowTen, "death"));
        expect(calculateRunPp(fastTen, "death")).toBeLessThan(110);
        expect(calculateRunPp([round({ correct: false })], "death")).toBe(0);
    });

    test("uses only the best death run for profile pp", () => {
        expect(calculateProfilePp([50, 120, 80], "death")).toBe(120);
        expect(calculateProfilePp([], "death")).toBe(0);
    });

    test("weights stronger runs most heavily instead of rewarding unlimited grinding", () => {
        expect(calculateProfilePp([100])).toBe(100);
        expect(calculateProfilePp([100, 100])).toBe(195);
        expect(calculateProfilePp(Array.from({ length: 1000 }, () => 100))).toBeLessThan(2_000);
        expect(calculateProfilePp([50, 100, 75])).toBe(calculateProfilePp([100, 75, 50]));
    });

    test("smooths empirical content difficulty around a neutral prior", () => {
        const easy = calculateEmpiricalDifficulty({ appearances: 100, correct_count: 95, total_response_time_ms: 400_000 });
        const hard = calculateEmpiricalDifficulty({ appearances: 100, correct_count: 20, total_response_time_ms: 2_400_000 });

        expect(calculateEmpiricalDifficulty()).toBe(1);
        expect(easy).toBeLessThan(1);
        expect(hard).toBeGreaterThan(1);
        expect(hard).toBeLessThanOrEqual(1.5);
    });
});
