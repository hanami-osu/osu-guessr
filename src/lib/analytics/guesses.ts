import { levenshteinSimilarity } from "../string-computing";

export type WrongGuessKind = "near_miss" | "artist" | "other";

const NEAR_MISS_SIMILARITY = 0.5;
const ARTIST_SIMILARITY = 0.8;
const MIN_PARTIAL_LENGTH = 3;
const MIN_PARTIAL_SHARE = 0.25;

function normalize(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Explains why a rejected guess missed: close to the answer, the artist instead of the title, or unrelated. */
export function classifyWrongGuess(guess: string, answer: string, artist: string | null): WrongGuessKind {
    const normalizedGuess = normalize(guess);
    const normalizedAnswer = normalize(answer);
    if (!normalizedGuess || !normalizedAnswer) return "other";

    const normalizedArtist = artist ? normalize(artist) : "";
    if (normalizedArtist && levenshteinSimilarity(normalizedGuess, normalizedArtist) >= ARTIST_SIMILARITY) return "artist";

    const [shorter, longer] = normalizedGuess.length <= normalizedAnswer.length ? [normalizedGuess, normalizedAnswer] : [normalizedAnswer, normalizedGuess];
    if (shorter.length >= Math.max(MIN_PARTIAL_LENGTH, longer.length * MIN_PARTIAL_SHARE) && longer.includes(shorter)) return "near_miss";
    if (levenshteinSimilarity(normalizedGuess, normalizedAnswer) >= NEAR_MISS_SIMILARITY) return "near_miss";

    return "other";
}
