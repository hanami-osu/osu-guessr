import { describe, expect, test } from "bun:test";
import { GameMode } from "@/actions/types";
import { getMediaMimeType, MediaUnavailableError } from "./media-format";

describe("media format validation", () => {
    test("maps actual extensions to MIME types and rejects incompatible media", () => {
        expect(getMediaMimeType(GameMode.Background, "123.webp")).toBe("image/webp");
        expect(getMediaMimeType(GameMode.Skin, "skin.png")).toBe("image/png");
        expect(getMediaMimeType(GameMode.Audio, "song.mp3")).toBe("audio/mpeg");
        expect(() => getMediaMimeType(GameMode.Background, "song.mp3")).toThrow(MediaUnavailableError);
    });
});
