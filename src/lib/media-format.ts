import path from "path";
import { GameMode } from "@/actions/types";

const MIME_TYPES: Record<string, string> = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
};

const MODE_EXTENSIONS: Record<GameMode, Set<string>> = {
    [GameMode.Background]: new Set([".webp", ".jpg", ".jpeg", ".png"]),
    [GameMode.Audio]: new Set([".mp3", ".ogg", ".wav"]),
    [GameMode.Skin]: new Set([".webp", ".jpg", ".jpeg", ".png"]),
};

export class MediaUnavailableError extends Error {
    constructor() {
        super("The selected media file is unavailable or invalid.");
        this.name = "MediaUnavailableError";
    }
}

export function getMediaMimeType(gameMode: GameMode, filename: string): string {
    const extension = path.extname(filename).toLowerCase();
    if (!MODE_EXTENSIONS[gameMode]?.has(extension) || !MIME_TYPES[extension]) {
        throw new MediaUnavailableError();
    }

    return MIME_TYPES[extension];
}
