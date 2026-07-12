import path from "path";

export interface AudioImportCandidate {
    name: string;
    size: number;
}

export class UnsupportedAudioFormatError extends Error {
    constructor() {
        super("This mapset does not contain MP3 audio. OGG and WAV imports are not supported; provide an MP3 source.");
        this.name = "UnsupportedAudioFormatError";
    }
}

export function selectAudioImportFile(candidates: AudioImportCandidate[]): string {
    const mp3Files = candidates.filter((candidate) => path.extname(candidate.name).toLowerCase() === ".mp3");
    if (mp3Files.length > 0) {
        return mp3Files.reduce((largest, candidate) => (candidate.size > largest.size ? candidate : largest)).name;
    }

    if (candidates.some((candidate) => [".ogg", ".wav"].includes(path.extname(candidate.name).toLowerCase()))) {
        throw new UnsupportedAudioFormatError();
    }

    throw new Error("No supported audio file was found in the mapset archive.");
}
