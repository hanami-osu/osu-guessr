import { describe, expect, test } from "bun:test";
import { getScorePpMaxRelativeGap, getScorePpRelativeGap } from "./difficulty";

describe("Score PP difficulty", () => {
    test("tightens the allowed PP gap as rounds progress", () => {
        expect(getScorePpMaxRelativeGap(1)).toBe(0.25);
        expect(getScorePpMaxRelativeGap(4)).toBe(0.18);
        expect(getScorePpMaxRelativeGap(7)).toBe(0.12);
        expect(getScorePpMaxRelativeGap(10)).toBe(0.08);
        expect(getScorePpMaxRelativeGap(13)).toBe(0.06);
        expect(getScorePpMaxRelativeGap(16)).toBe(0.04);
        expect(getScorePpMaxRelativeGap(36)).toBe(0.02);
        expect(getScorePpMaxRelativeGap(100)).toBe(0.02);
    });

    test("measures the gap relative to the stronger play", () => {
        expect(getScorePpRelativeGap(400, 300)).toBeCloseTo(0.25);
        expect(getScorePpRelativeGap(600, 594)).toBeCloseTo(0.01);
        expect(getScorePpRelativeGap(0, 0)).toBe(Number.POSITIVE_INFINITY);
    });
});
