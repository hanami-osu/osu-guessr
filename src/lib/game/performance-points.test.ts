import { describe, expect, test } from "bun:test";
import { calculateEmpiricalDifficulty, calculateProfilePp, calculateRunPp, type PerformanceRound } from "./performance-points";

function round(overrides: Partial<PerformanceRound> = {}): PerformanceRound {
    return {
        correct: true,
        response_time_ms: 10_000,
        time_limit_ms: 30_000,
        difficulty_snapshot: 1,
        ...overrides,
    };
}

describe("performance points", () => {
    test("rewards accuracy, speed, difficulty, consistency, and longer death runs", () => {
        const baseline = Array.from({ length: 10 }, () => round());
        const faster = baseline.map(() => round({ response_time_ms: 3_000 }));
        const harder = baseline.map(() => round({ difficulty_snapshot: 1.3 }));
        const inconsistent = baseline.map((_, index) => round({ response_time_ms: index % 2 === 0 ? 1_000 : 25_000 }));
        const miss = baseline.map((value, index) => (index === 0 ? round({ correct: false, response_time_ms: 30_000 }) : value));
        const shortDeath = [...Array.from({ length: 5 }, () => round()), round({ correct: false })];
        const longDeath = [...Array.from({ length: 20 }, () => round()), round({ correct: false })];

        expect(calculateRunPp(faster, "classic")).toBeGreaterThan(calculateRunPp(baseline, "classic"));
        expect(calculateRunPp(harder, "classic")).toBeGreaterThan(calculateRunPp(baseline, "classic"));
        expect(calculateRunPp(inconsistent, "classic")).toBeLessThan(calculateRunPp(baseline, "classic"));
        expect(calculateRunPp(miss, "classic")).toBeLessThan(calculateRunPp(baseline, "classic"));
        expect(calculateRunPp(longDeath, "death")).toBeGreaterThan(calculateRunPp(shortDeath, "death"));
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
