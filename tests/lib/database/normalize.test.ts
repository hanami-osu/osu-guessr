import { describe, expect, test } from "bun:test";
import { normalizeDatabaseValue } from "@/lib/database/normalize";

describe("normalizeDatabaseValue", () => {
    test("converts decimal-like aggregate values to plain numbers", () => {
        const decimalLike = {
            constructor: function Decimal2() {},
            s: 1,
            e: 3,
            d: [1234],
            toNumber: () => 1234,
        };

        expect(normalizeDatabaseValue({ total_score: decimalLike })).toEqual({ total_score: 1234 });
    });

    test("normalizes nested database rows", () => {
        const endedAt = new Date("2026-06-13T00:00:00.000Z");

        expect(
            normalizeDatabaseValue([
                {
                    games_played: 12n,
                    ended_at: endedAt,
                    badges: [{ name: "supporter" }],
                },
            ]),
        ).toEqual([
            {
                games_played: 12,
                ended_at: endedAt,
                badges: [{ name: "supporter" }],
            },
        ]);
    });
});
