export function levenshteinSimilarity(wordA: string, wordB: string): number {
    const [dist, len] = levenshteinDistance(wordA, wordB);

    return (len - dist) / len;
}

function levenshteinDistance(wordA: string, wordB: string): [number, number] {
    let m = [...wordA].length;
    let n = [...wordB].length;

    if (m > n) {
        [wordA, wordB] = [wordB, wordA];
        [m, n] = [n, m];
    }

    const costs = Array.from({ length: n + 1 }, (_, i) => i);

    for (let i = 0; i < wordA.length; i++) {
        let lastVal = i + 1;

        for (let j = 0; j < wordB.length; j++) {
            const newVal = wordA[i] === wordB[j] ? costs[j] : Math.min(costs[j], lastVal, costs[j + 1]) + 1;

            costs[j] = lastVal;
            lastVal = newVal;
        }

        costs[n] = lastVal;
    }

    return [costs[n], n];
}

export function gestaltPattern(wordA: string, wordB: string): number {
    const charsA = [...wordA].length;
    const charsB = [...wordB].length;

    const buf = new Array(Math.max(charsA, charsB) + 1).fill(0);

    const matchingChars = gestaltPatternMatching(wordA, wordB, buf);

    return (2 * matchingChars) / (charsA + charsB);
}

interface SubstringResult {
    startA: number;
    startB: number;
    len: number;
}

function gestaltPatternMatching(wordA: string, wordB: string, buf: Array<number>): number {
    const result = longestCommonSubstring(wordA, wordB, buf);
    const { startA, startB, len } = result;

    if (len === 0) {
        return 0;
    }

    let matches = len;

    if (startA > 0 && startB > 0) {
        const prefixA = prefix(wordA, startA);
        const prefixB = prefix(wordB, startB);
        matches += gestaltPatternMatching(prefixA, prefixB, buf);
    }

    const suffixA = suffix(wordA, startA + len);
    const suffixB = suffix(wordB, startB + len);

    if (suffixA.length > 0 && suffixB.length > 0) {
        matches += gestaltPatternMatching(suffixA, suffixB, buf);
    }

    return matches;
}

function prefix(s: string, len: number): string {
    return [...s].slice(0, len).join("");
}

function suffix(s: string, start: number): string {
    return [...s].slice(start).join("");
}

function longestCommonSubstring(wordA: string, wordB: string, buf: number[]): SubstringResult {
    if (wordA.length === 0 || wordB.length === 0) {
        return { startA: 0, startB: 0, len: 0 };
    }

    let swapped = false;
    let m = [...wordA].length;
    let n = [...wordB].length;

    if (m > n) {
        [wordA, wordB] = [wordB, wordA];
        [m, n] = [n, m];
        swapped = true;
    }

    let len = 0;
    let startB = 0;
    let endA = 0;

    const charsA = [...wordA].reverse();
    const charsB = [...wordB];

    for (let j = 0; j < charsA.length; j++) {
        for (let i = 0; i < charsB.length; i++) {
            if (charsA[j] !== charsB[i]) {
                buf[i] = 0;
                continue;
            }

            const val = buf[i + 1] + 1;
            buf[i] = val;

            if (val > len) {
                len = val;
                startB = i;
                endA = j;
            }
        }
    }

    const [finalStartA, finalStartB] = swapped ? [startB, m - endA - 1] : [m - endA - 1, startB];

    for (let i = 0; i < n; i++) {
        buf[i] = 0;
    }

    return {
        startA: finalStartA,
        startB: finalStartB,
        len: len,
    };
}
