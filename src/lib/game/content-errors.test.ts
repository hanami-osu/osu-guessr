import { describe, expect, test } from "bun:test";
import { MediaUnavailableError } from "@/lib/media-format";
import { isNoGameContentError, NoGameContentError } from "./content-errors";

describe("content exhaustion errors", () => {
    test("does not treat media failures as exhausted game content", () => {
        expect(isNoGameContentError(new NoGameContentError("No background found"))).toBe(true);
        expect(isNoGameContentError(new MediaUnavailableError())).toBe(false);
    });
});
