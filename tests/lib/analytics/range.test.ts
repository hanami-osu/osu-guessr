import { describe, expect, test } from "bun:test";

import { bucketKey, listBuckets, parseAnalyticsRange, resolveRange } from "@/lib/analytics/range";

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
});
