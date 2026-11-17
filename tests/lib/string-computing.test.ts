import { expect, test, describe } from "bun:test";
import { levenshteinSimilarity, gestaltPattern } from "@/lib/string-computing";

describe("String Computing", () => {
    describe("levenshteinSimilarity", () => {
        test("identical strings should have similarity 1", () => {
            expect(levenshteinSimilarity("hello", "hello")).toBe(1);
        });

        test("completely different strings should have low similarity", () => {
            expect(levenshteinSimilarity("abc", "xyz")).toBe(0);
        });

        test("similar strings should have high similarity", () => {
            const similarity = levenshteinSimilarity("kitten", "sitting");
            // kitten -> sitting (sub k with s, sub e with i, add g) -> 3 operations. length = 7. similarity = (7-3)/7 = 4/7 ~= 0.57
            expect(similarity).toBeGreaterThan(0.5);
            expect(similarity).toBeLessThan(0.6);
        });

        test("case sensitive check", () => {
            expect(levenshteinSimilarity("Hello", "hello")).toBeLessThan(1);
        });
    });

    describe("gestaltPattern", () => {
        test("identical strings should have similarity 1", () => {
            expect(gestaltPattern("hello", "hello")).toBe(1);
        });

        test("similar strings should compute correctly", () => {
            const similarity = gestaltPattern("kitten", "sitting");
            expect(similarity).toBeGreaterThan(0);
        });

        test("empty strings", () => {
            expect(gestaltPattern("", "")).toBe(NaN); // (2*0) / (0+0) = 0/0 = NaN
        });

        test("one empty string", () => {
            expect(gestaltPattern("hello", "")).toBe(0);
        });
    });
});
