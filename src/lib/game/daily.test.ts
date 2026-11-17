import { describe, expect, test } from "bun:test";
import { DAILY_ROUNDS, createDailyRandom, formatDailyShareResult, getDailyChallengeDay, getDailyDate, getDailyItemId, getNextDailyReset, parseFutureDailyDate } from "./daily";
import { shouldAutoClaimGuestDailyResult } from "./daily-client";

describe("daily challenge helpers", () => {
    test("uses the UTC date and advances at midnight UTC", () => {
        expect(getDailyChallengeDay(new Date("2026-11-15T23:59:59.999Z"))).toBe(1);
        expect(getDailyChallengeDay(new Date("2026-11-16T00:00:00.000Z"))).toBe(2);
        expect(getDailyChallengeDay(new Date("2026-11-16T00:00:00.000Z"), 3)).toBe(5);
    });

    test("normalizes daily dates and reset time to UTC midnight", () => {
        const now = new Date("2026-11-16T18:24:00.000Z");
        expect(getDailyDate(now).toISOString()).toBe("2026-11-16T00:00:00.000Z");
        expect(getNextDailyReset(now).toISOString()).toBe("2026-11-17T00:00:00.000Z");
    });

    test("applies debug offset to the UTC challenge date and its day number", () => {
        const now = new Date("2026-11-17T18:24:00.000Z");

        const offsetDate = getDailyDate(now, 6);
        expect(offsetDate.toISOString()).toBe("2026-11-23T00:00:00.000Z");
        expect(getDailyChallengeDay(now)).toBe(3);
        expect(getDailyChallengeDay(offsetDate)).toBe(9);
    });

    test("parses manually selected future dates in dd/mm/yyyy format", () => {
        expect(parseFutureDailyDate("18/11/2026", new Date("2026-11-17T23:59:00Z")).toISOString()).toBe("2026-11-18T00:00:00.000Z");
        expect(() => parseFutureDailyDate("17/11/2026", new Date("2026-11-17T12:00:00Z"))).toThrow("future UTC date");
        expect(() => parseFutureDailyDate("31/02/2027")).toThrow("valid calendar date");
        expect(() => parseFutureDailyDate("2026-11-18")).toThrow("dd/mm/yyyy");
    });

    test("auto-claims guest results only after an authenticated session resolves", () => {
        expect(shouldAutoClaimGuestDailyResult("loading", false, true)).toBe(false);
        expect(shouldAutoClaimGuestDailyResult("unauthenticated", false, true)).toBe(false);
        expect(shouldAutoClaimGuestDailyResult("authenticated", false, true)).toBe(false);
        expect(shouldAutoClaimGuestDailyResult("authenticated", true, false)).toBe(false);
        expect(shouldAutoClaimGuestDailyResult("authenticated", true, true)).toBe(true);
    });

    test("selects a stable, distinct five-round sequence per mode and day", () => {
        const ids = Array.from({ length: 10 }, (_, index) => index + 1);
        const background = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyItemId(ids, 12, "background", index + 1));
        expect(background).toEqual(Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyItemId(ids, 12, "background", index + 1)));
        expect(new Set(background).size).toBe(DAILY_ROUNDS);
        const audio = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyItemId(ids, 12, "audio", index + 1));
        const nextDay = Array.from({ length: DAILY_ROUNDS }, (_, index) => getDailyItemId(ids, 13, "background", index + 1));
        expect(audio).not.toEqual(background);
        expect(nextDay).not.toEqual(background);
    });

    test("does not select outside five rounds or from an undersized pool", () => {
        expect(getDailyItemId([1, 2, 3, 4], 1, "background", 1)).toBeUndefined();
        expect(getDailyItemId([1, 2, 3, 4, 5], 1, "background", 6)).toBeUndefined();
        expect(getDailyItemId([1, 2, 3, 4, 5], 1, "background", 1.5)).toBeUndefined();
    });

    test("creates a repeatable random stream for seeded daily pair selection", () => {
        const first = createDailyRandom("daily:2026-11-16:score_pp:1");
        const repeated = createDailyRandom("daily:2026-11-16:score_pp:1");
        const nextDay = createDailyRandom("daily:2026-11-17:score_pp:1");
        const firstValues = Array.from({ length: 5 }, () => first());

        expect(firstValues).toEqual(Array.from({ length: 5 }, () => repeated()));
        expect(firstValues).not.toEqual(Array.from({ length: 5 }, () => nextDay()));
    });

    test("formats the requested compact daily share result", () => {
        expect(formatDailyShareResult("background", 213, 3, 2140, 40_000, ["correct", "correct", "skip", "incorrect", "correct"])).toBe(
            "osu!guessr daily background #213\n🟢🟢🟠🔴🟢  3/5 · 2,140 pts · 40s\nhttps://osuguessr.com/daily/share?mode=background&day=213&points=2140&time=40000&rounds=ccsic",
        );
    });
});
