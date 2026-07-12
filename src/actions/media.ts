import path from "path";
import fs from "fs/promises";
import { GameMode } from "./types";
import { getMediaMimeType, MediaUnavailableError } from "@/lib/media-format";

export async function getMediaData(gameMode: GameMode, filename: string | null): Promise<string> {
    if (!filename) throw new MediaUnavailableError();

    try {
        let filePath: string;

        if (gameMode === GameMode.Background) {
            filePath = path.join(process.cwd(), "mapsets", "backgrounds", filename);
        } else if (gameMode === GameMode.Audio) {
            filePath = path.join(process.cwd(), "mapsets", "audio", filename);
        } else if (gameMode === GameMode.Skin) {
            filePath = path.join(process.cwd(), "mapsets", "skins", filename);
        } else {
            throw new MediaUnavailableError();
        }

        const mimeType = getMediaMimeType(gameMode, filename);
        const buffer = await fs.readFile(filePath);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch (error) {
        console.error(`Failed to load media for ${gameMode} with filename ${filename}:`, error);
        if (error instanceof MediaUnavailableError) throw error;
        throw new MediaUnavailableError();
    }
}
