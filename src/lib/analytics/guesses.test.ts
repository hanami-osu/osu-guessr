import { describe, expect, test } from "bun:test";

import { classifyWrongGuess } from "./guesses";

describe("classifyWrongGuess", () => {
    test("flags typos and partial titles as near misses", () => {
        expect(classifyWrongGuess("asymetry", "Asymmetry", "Reol")).toBe("near_miss");
        expect(classifyWrongGuess("river flows", "River Flows In You (A Love Note)", "Yiruma")).toBe("near_miss");
    });

    test("flags the artist typed instead of the title", () => {
        expect(classifyWrongGuess("reol", "Asymmetry", "Reol")).toBe("artist");
    });

    test("treats unrelated guesses as other", () => {
        expect(classifyWrongGuess("freedom dive", "Asymmetry", "Reol")).toBe("other");
        expect(classifyWrongGuess("!!!", "Asymmetry", null)).toBe("other");
        expect(classifyWrongGuess("s", "Idola no Circus", null)).toBe("other");
        expect(classifyWrongGuess("no", "Idola no Circus", null)).toBe("other");
    });
});
