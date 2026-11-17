import { gestaltPattern, levenshteinSimilarity } from "./string-computing";

export enum GuessDifficulty {
    Easy = 0.5,
    Hard = 0.7,
    Impossible = 0.95,
}

export function normalizeString(str: string): string {
    let normalized = str.toLowerCase();

    // Ignore version labels such as "(TV Size)".
    normalized = normalized.replace(/\(.*?\)/g, "");

    // Ignore featured-artist credits.
    normalized = normalized.replace(/\b(?:feat|ft)\.?\b.*/g, "");

    normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, "").trim();

    return normalized;
}

export function checkGuess(guess: string, actual: string, difficulty: GuessDifficulty = 0.5): boolean {
    if (guess.trim() && guess.trim().toLowerCase() === actual.trim().toLowerCase()) return true;

    guess = normalizeString(guess);
    actual = normalizeString(actual);

    if (!guess || !actual) {
        return false;
    }

    if (guess === actual) {
        return true;
    }

    if (levenshteinSimilarity(guess, actual) > difficulty || gestaltPattern(guess, actual) > difficulty + 0.1) {
        return true;
    }

    return false;
}
