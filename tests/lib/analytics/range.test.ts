import { describe, expect, test } from "bun:test";

import { bucketKey, listBuckets, parseAnalyticsRange, parseAnalyticsSelection, resolveRange } from "@/lib/analytics/range";

describe("analytics range", () => {
    test("falls back to 30 days for unknown values", () => {
        expect(parseAnalyticsRange("90d")).toBe("90d");
        expect(parseAnalyticsRange("bogus")).toBe("30d");
        expect(parseAnalyticsRange("constructor")).toBe("30d");
        expect(parseAnalyticsRange(undefined)).toBe("30d");
    });

    test("buckets weeks from Monday in UTC", () => {
        expect(bucketKey(new Date("2026-11-12T23:30:00Z"), "week")).toBe("2026-11-09");
        expect(bucketKey(new Date("2026-11-09T00:00:00Z"), "week")).toBe("2026-11-09");
        expect(bucketKey(new Date("2026-11-08T12:00:00Z"), "week")).toBe("2026-11-02");
    });

    test("lists every bucket including the current one", () => {
        expect(listBuckets(new Date("2026-11-10T15:00:00Z"), new Date("2026-11-12T01:00:00Z"), "day")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    });

    test("uses weekly buckets and no comparison period for long all-time ranges", () => {
        const resolved = resolveRange("all", new Date("2026-11-12T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
        expect(resolved.bucket).toBe("week");
        expect(resolved.previousSince).toBeNull();
    });
    test("uses a valid from/to pair and falls back to the preset otherwise", () => {
        expect(parseAnalyticsSelection({ from: "2026-11-01", to: "2026-11-07", range: "7d" })).toEqual({ from: "2026-11-01", to: "2026-11-07" });
        expect(parseAnalyticsSelection({ from: "2026-11-07", to: "2026-11-01", range: "7d" })).toBe("7d");
        expect(parseAnalyticsSelection({ from: "2026-02-31", to: "2026-03-02" })).toBe("30d");
        expect(parseAnalyticsSelection({ from: "2026-11-01" })).toBe("30d");
        expect(parseAnalyticsSelection({ from: ["2026-11-01"], to: "2026-11-07" })).toBe("30d");
    });

    test("resolves a custom range to whole UTC days with an equally long comparison period", () => {
        const resolved = resolveRange({ from: "2026-11-01", to: "2026-11-07" }, new Date("2026-11-20T12:00:00Z"), null);
        expect(resolved.range).toBe("custom");
        expect(resolved.since.toISOString()).toBe("2026-11-01T00:00:00.000Z");
        expect(resolved.until.toISOString()).toBe("2026-11-08T00:00:00.000Z");
        expect(resolved.previousSince?.toISOString()).toBe("2026-10-25T00:00:00.000Z");
        expect(resolved.bucket).toBe("day");
    });

    test("does not let a custom range end in the future", () => {
        const resolved = resolveRange({ from: "2026-11-15", to: "2026-12-31" }, new Date("2026-11-20T12:00:00Z"), null);
        expect(resolved.until.toISOString()).toBe("2026-11-21T12:00:00.000Z");
    });
});
