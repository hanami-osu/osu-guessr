import { expect, test, describe } from "bun:test";
import { checkGuess, GuessDifficulty } from "@/lib/game/guess-checker";

describe("Guess Checker", () => {
    describe("checkGuess", () => {
        test("exact match", () => {
            expect(checkGuess("hello world", "hello world")).toBe(true);
        });

        test("case insensitivity", () => {
            expect(checkGuess("Hello World", "hello world")).toBe(true);
            expect(checkGuess("HELLO WORLD", "hello world")).toBe(true);
        });

        test("removes special characters", () => {
            expect(checkGuess("hello world!", "hello world")).toBe(true);
            expect(checkGuess("hello-world", "hello world")).toBe(true);
        });

        test("preserves Unicode letters and numbers while ignoring punctuation", () => {
            expect(checkGuess("東京２０２５！", "東京２０２５", GuessDifficulty.Impossible)).toBe(true);
            expect(checkGuess("東京２０２５ music", "京都２０２５ music", GuessDifficulty.Impossible)).toBe(false);
            expect(checkGuess("東京２０２５ music", "東京２０２６ music", GuessDifficulty.Impossible)).toBe(false);
        });

        test("matches symbolic titles only when the nonempty text agrees", () => {
            expect(checkGuess("!!!", "!!!")).toBe(true);
            expect(checkGuess("", "!!!")).toBe(false);
            expect(checkGuess("!!!", "？？？")).toBe(false);
            expect(checkGuess("!!!", "song")).toBe(false);
            expect(checkGuess("song", "!!!")).toBe(false);
        });

        test("keeps fuzzy matching for Unicode text", () => {
            expect(checkGuess("夜明けの歌", "夜明けの唄", GuessDifficulty.Easy)).toBe(true);
        });

        test("fuzzy-matches supplementary-plane letters by code point", () => {
            expect(checkGuess("𐐨𐐨𐐨𐐩", "𐐨𐐨𐐨𐐨", GuessDifficulty.Hard)).toBe(true);
        });

        test("handles parentheses in actual answer", () => {
            expect(checkGuess("my song", "my song (TV Size)")).toBe(true);
            expect(checkGuess("my song tv size", "my song (TV Size)")).toBe(true);
        });

        test("handles feat/ft in actual answer", () => {
            expect(checkGuess("cool track", "cool track feat. Hatsune Miku")).toBe(true);
            expect(checkGuess("cool track", "cool track ft. Hatsune Miku")).toBe(true);
            expect(checkGuess("cool track", "cool track feat Hatsune Miku")).toBe(true);
        });

        test("fuzzy matching with levenshtein", () => {
            // "night of nights" vs "night of knight"
            expect(checkGuess("night of knight", "night of nights", GuessDifficulty.Easy)).toBe(true);
        });

        test("fuzzy matching shouldn't allow completely wrong answers", () => {
            expect(checkGuess("darude sandstorm", "rick astley never gonna give you up")).toBe(false);
        });

        test("difficulty thresholds", () => {
            // "abcdefgh" vs "abcdefxy" -> 6/8 = 0.75 similarity
            // Easy is 0.5, Hard is 0.7, Impossible is 0.95
            expect(checkGuess("abcdefxy", "abcdefgh", GuessDifficulty.Easy)).toBe(true);
            expect(checkGuess("abcdefxy", "abcdefgh", GuessDifficulty.Hard)).toBe(true);
            expect(checkGuess("abcdefxy", "abcdefgh", GuessDifficulty.Impossible)).toBe(false);
        });
    });
});
