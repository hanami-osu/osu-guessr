import { afterEach, describe, expect, test } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { isMp3File, selectAudioImportFile, UnsupportedAudioFormatError } from "./importer-validation";
import { parseSkinApiResponse } from "./skin-import";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function createMp3Fixture(withId3Tag = false): Uint8Array {
    const frameLength = 417;
    const audioOffset = withId3Tag ? 10 : 0;
    const fixture = new Uint8Array(audioOffset + frameLength * 2);
    const frameHeader = [0xff, 0xfb, 0x90, 0x64];
    if (withId3Tag) fixture.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0);
    fixture.set(frameHeader, audioOffset);
    fixture.set(frameHeader, audioOffset + frameLength);
    return fixture;
}

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
                { name: "large.ogg", size: 5000, isValidMp3: false },
                { name: "small.mp3", size: 1000, isValidMp3: true },
                { name: "renamed.mp3", size: 3000, isValidMp3: false },
                { name: "large.mp3", size: 2000, isValidMp3: true },
            ])
        ).toBe("large.mp3");
        expect(() => selectAudioImportFile([{ name: "audio.wav", size: 1000, isValidMp3: false }])).toThrow(UnsupportedAudioFormatError);
    });

    test("validates MP3 content instead of trusting an .mp3 extension", async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), "osu-guessr-audio-"));
        temporaryDirectories.push(directory);
        const genuineMp3 = path.join(directory, "genuine.mp3");
        const renamedOgg = path.join(directory, "renamed-ogg.mp3");
        const renamedWav = path.join(directory, "renamed-wav.mp3");

        await Promise.all([
            fs.writeFile(genuineMp3, createMp3Fixture(true)),
            fs.writeFile(renamedOgg, new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00])),
            fs.writeFile(renamedWav, new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])),
        ]);

        expect(await isMp3File(genuineMp3)).toBe(true);
        expect(await isMp3File(renamedOgg)).toBe(false);
        expect(await isMp3File(renamedWav)).toBe(false);
    });

    test("validates skin API data and rejects NSFW or malformed metadata", () => {
        expect(parseSkinApiResponse(validSkinResponse, 42).name).toBe("Example Skin");
        expect(() => parseSkinApiResponse({ ...validSkinResponse, message: { ...validSkinResponse.message, _nsfw: true } }, 42)).toThrow("NSFW skins are not allowed");
        expect(() => parseSkinApiResponse({ ...validSkinResponse, message: { ...validSkinResponse.message, screenshots: [] } }, 42)).toThrow();
        expect(() => parseSkinApiResponse(validSkinResponse, 7)).toThrow("unexpected skin ID");
    });
});
