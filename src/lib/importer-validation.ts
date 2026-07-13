import path from "path";
import fs from "fs/promises";

const MP3_SCAN_BYTES = 64 * 1024;

const MPEG1_LAYER_3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] as const;
const MPEG2_LAYER_3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] as const;
const MPEG1_SAMPLE_RATES = [44_100, 48_000, 32_000] as const;

export interface AudioImportCandidate {
    name: string;
    size: number;
    isValidMp3: boolean;
}

export class UnsupportedAudioFormatError extends Error {
    constructor() {
        super("This mapset does not contain valid MP3 audio. OGG and WAV data are not supported, even when renamed with an .mp3 extension.");
        this.name = "UnsupportedAudioFormatError";
    }
}

function getMp3FrameLength(data: Uint8Array, offset: number): number | null {
    if (offset + 4 > data.length) return null;

    const byte1 = data[offset + 1];
    const byte2 = data[offset + 2];
    const byte3 = data[offset + 3];

    if (data[offset] !== 0xff || (byte1 & 0xe0) !== 0xe0) return null;

    const versionBits = (byte1 >> 3) & 0x03;
    const layerBits = (byte1 >> 1) & 0x03;
    const bitrateIndex = (byte2 >> 4) & 0x0f;
    const sampleRateIndex = (byte2 >> 2) & 0x03;

    if (versionBits === 0x01 || layerBits !== 0x01 || bitrateIndex === 0 || bitrateIndex === 0x0f || sampleRateIndex === 0x03 || (byte3 & 0x03) === 0x02) {
        return null;
    }

    const isMpeg1 = versionBits === 0x03;
    const bitrate = (isMpeg1 ? MPEG1_LAYER_3_BITRATES : MPEG2_LAYER_3_BITRATES)[bitrateIndex];
    const sampleRateDivisor = versionBits === 0x03 ? 1 : versionBits === 0x02 ? 2 : 4;
    const sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex] / sampleRateDivisor;
    const padding = (byte2 >> 1) & 0x01;

    return Math.floor(((isMpeg1 ? 144 : 72) * bitrate * 1000) / sampleRate) + padding;
}

export function hasMp3FrameSequence(data: Uint8Array): boolean {
    if (data.length >= 4 && String.fromCharCode(...data.subarray(0, 4)) === "OggS") return false;
    if (data.length >= 12 && String.fromCharCode(...data.subarray(0, 4)) === "RIFF" && String.fromCharCode(...data.subarray(8, 12)) === "WAVE") return false;

    for (let offset = 0; offset + 4 <= data.length; offset += 1) {
        const frameLength = getMp3FrameLength(data, offset);
        if (frameLength && getMp3FrameLength(data, offset + frameLength)) {
            return true;
        }
    }

    return false;
}

function getId3AudioOffset(header: Uint8Array): number | null {
    if (header.length < 10 || String.fromCharCode(...header.subarray(0, 3)) !== "ID3") return 0;

    const sizeBytes = header.subarray(6, 10);
    if ([...sizeBytes].some((byte) => (byte & 0x80) !== 0)) return null;

    return 10 + ((sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3]);
}

export async function isMp3File(filePath: string): Promise<boolean> {
    const file = await fs.open(filePath, "r");

    try {
        const stats = await file.stat();
        if (stats.size < 8) return false;

        const header = new Uint8Array(Math.min(12, stats.size));
        await file.read(header, 0, header.length, 0);
        const audioOffset = getId3AudioOffset(header);
        if (audioOffset === null || audioOffset >= stats.size) return false;

        const scan = new Uint8Array(Math.min(MP3_SCAN_BYTES, stats.size - audioOffset));
        await file.read(scan, 0, scan.length, audioOffset);
        return hasMp3FrameSequence(scan);
    } finally {
        await file.close();
    }
}

export function selectAudioImportFile(candidates: AudioImportCandidate[]): string {
    const mp3Files = candidates.filter((candidate) => path.extname(candidate.name).toLowerCase() === ".mp3" && candidate.isValidMp3);
    if (mp3Files.length > 0) {
        return mp3Files.reduce((largest, candidate) => (candidate.size > largest.size ? candidate : largest)).name;
    }

    if (candidates.some((candidate) => [".mp3", ".ogg", ".wav"].includes(path.extname(candidate.name).toLowerCase()))) {
        throw new UnsupportedAudioFormatError();
    }

    throw new Error("No supported audio file was found in the mapset archive.");
}
