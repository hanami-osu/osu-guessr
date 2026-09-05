import { describe, expect, spyOn, test } from "bun:test";
import { GameMode } from "./types";
import { getMediaData } from "./media";
import { MediaUnavailableError } from "@/lib/media-format";

describe("getMediaData", () => {
    test("returns a controlled error when selected media is missing", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(() => {});

        try {
            await expect(getMediaData(GameMode.Background, "missing-import-test.webp")).rejects.toBeInstanceOf(MediaUnavailableError);
        } finally {
            consoleError.mockRestore();
        }
    });

    test("rejects filenames that escape the media directory", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(() => {});

        try {
            await expect(getMediaData(GameMode.Background, "../../public/main_bg.webp")).rejects.toBeInstanceOf(MediaUnavailableError);
        } finally {
            consoleError.mockRestore();
        }
    });
});
