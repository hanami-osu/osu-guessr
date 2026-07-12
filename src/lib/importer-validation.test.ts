import { describe, expect, test } from "bun:test";
import { selectAudioImportFile, UnsupportedAudioFormatError } from "./importer-validation";
import { parseSkinApiResponse } from "./skin-import";

const validSkinResponse = {
    status: "success",
    message: {
        _nsfw: false,
        id: 42,
        name: "Example Skin",
        gamemodes: [0],
        screenshots: [
            {
                category: 6,
                gamemode: 0,
                large: "https://example.com/large.png",
                medium: "https://example.com/medium.png",
                small: "https://example.com/small.png",
            },
        ],
        link_to_skin: "https://example.com/skin.osk",
    },
} as const;

describe("importer file validation", () => {
    test("selects the largest MP3 without renaming OGG or WAV data", () => {
        expect(
            selectAudioImportFile([
                { name: "large.ogg", size: 5000 },
                { name: "small.mp3", size: 1000 },
                { name: "large.mp3", size: 2000 },
            ])
        ).toBe("large.mp3");
        expect(() => selectAudioImportFile([{ name: "audio.wav", size: 1000 }])).toThrow(UnsupportedAudioFormatError);
    });

    test("validates skin API data and rejects NSFW or malformed metadata", () => {
        expect(parseSkinApiResponse(validSkinResponse, 42).name).toBe("Example Skin");
        expect(() => parseSkinApiResponse({ ...validSkinResponse, message: { ...validSkinResponse.message, _nsfw: true } }, 42)).toThrow("NSFW skins are not allowed");
        expect(() => parseSkinApiResponse({ ...validSkinResponse, message: { ...validSkinResponse.message, screenshots: [] } }, 42)).toThrow();
        expect(() => parseSkinApiResponse(validSkinResponse, 7)).toThrow("unexpected skin ID");
    });
});
