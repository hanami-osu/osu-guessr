import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import unzipper from "unzipper";
import sharp from "sharp";
import { env } from "@/lib/infra/env";
import { isMp3File, selectAudioImportFile, type AudioImportCandidate } from "@/lib/media/importer-validation";

export const MAPSET_DIRECTORIES = {
    audio: path.join(process.cwd(), "mapsets", "audio"),
    backgrounds: path.join(process.cwd(), "mapsets", "backgrounds"),
    temp: path.join(process.cwd(), "tmp"),
} as const;

const OSU_API_KEY = env.OSU_API_KEY;
const BEATCONNECT_BASE_URL = "https://beatconnect.io/b";
const OSU_COVERS_BASE_URL = "https://assets.ppy.sh/beatmaps";
const OSU_API_BASE_URL = "https://osu.ppy.sh/api/get_beatmaps";
const MAX_ARCHIVE_FILES = 1000;
const MAX_ARCHIVE_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 100 * 1024 * 1024;


export interface ImportMapsetResult {
    success: boolean;
    note?: "already_exists";
    error?: string;
}

interface BeatmapData {
    title: string;
    artist: string;
    creator: string;
    rankedAt: Date | null;
    starRatingMin: number | null;
    starRatingMax: number | null;
}

interface OsuApiResponse {
    title: string;
    artist: string;
    creator: string;
    approved_date?: string | null;
    difficultyrating?: string | null;
}

interface ArchiveEntryMetadata {
    path: string;
    type?: string;
    uncompressedSize?: number;
    vars?: {
        uncompressedSize?: number;
    };
    externalFileAttributes?: number;
}

function resolveContainedPath(baseDir: string, unsafePath: string): string {
    if (!unsafePath || unsafePath.includes("\0") || unsafePath.includes("\\") || path.isAbsolute(unsafePath) || unsafePath.split("/").includes("..")) {
        throw new Error("Unsafe archive path");
    }

    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(resolvedBase, unsafePath);

    if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + path.sep)) {
        throw new Error("Unsafe archive path");
    }

    return resolvedPath;
}

export function resolveMediaPath(baseDirectory: string, filename: string): string {
    if (!filename || filename.includes("\0") || filename.includes("\\") || path.basename(filename) !== filename) {
        throw new Error("Invalid filename");
    }

    const baseDir = path.resolve(baseDirectory);
    const resolved = path.resolve(baseDir, filename);

    if (!resolved.startsWith(baseDir + path.sep)) {
        throw new Error("Invalid filename");
    }

    return resolved;
}

function getArchiveEntrySize(entry: ArchiveEntryMetadata): number {
    return entry.uncompressedSize ?? entry.vars?.uncompressedSize ?? 0;
}

function isArchiveSymlink(entry: ArchiveEntryMetadata): boolean {
    const mode = (entry.externalFileAttributes ?? 0) >>> 16;
    return entry.type === "SymbolicLink" || (mode & 0o170000) === 0o120000;
}

async function ensureDirectories(): Promise<void> {
    const directories = Object.values(MAPSET_DIRECTORIES);
    await Promise.all(directories.map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function cleanupDirectory(dirPath: string): Promise<void> {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
        console.warn(`Failed to cleanup directory ${dirPath}:`, error);
    }
}

async function getBeatmapData(mapsetId: number): Promise<BeatmapData | null> {
    if (!OSU_API_KEY) {
        throw new Error("OSU_API_KEY environment variable is not set");
    }

    try {
        const url = `${OSU_API_BASE_URL}?k=${OSU_API_KEY}&s=${mapsetId}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = (await response.json()) as OsuApiResponse[];

        if (!data || data.length === 0) {
            return null;
        }

        const starRatings = data.map((beatmap) => Number(beatmap.difficultyrating)).filter(Number.isFinite);

        return {
            title: data[0].title,
            artist: data[0].artist,
            creator: data[0].creator,
            rankedAt: data[0].approved_date ? new Date(data[0].approved_date) : null,
            starRatingMin: starRatings.length > 0 ? Math.min(...starRatings) : null,
            starRatingMax: starRatings.length > 0 ? Math.max(...starRatings) : null,
        };
    } catch (error) {
        console.error(`Failed to fetch beatmap data for ${mapsetId}:`, error);
        return null;
    }
}

async function downloadMapset(mapsetId: number): Promise<string | null> {
    const tempDir = path.join(MAPSET_DIRECTORIES.temp, mapsetId.toString());
    await fs.mkdir(tempDir, { recursive: true });

    try {
        const oszUrl = `${BEATCONNECT_BASE_URL}/${mapsetId}`;
        const response = await fetch(oszUrl);

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        const oszPath = path.join(tempDir, `${mapsetId}.osz`);

        if (response.body) {
            const nodeStream = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
            await pipeline(nodeStream, fsSync.createWriteStream(oszPath));
        } else {
            throw new Error("No response body");
        }

        const stats = await fs.stat(oszPath);
        if (stats.size === 0) {
            throw new Error("Downloaded file is empty");
        }

        const directory = await unzipper.Open.file(oszPath);

        if (directory.files.length > MAX_ARCHIVE_FILES) {
            throw new Error("Archive contains too many files");
        }

        let totalExtractedBytes = 0;

        for (const entry of directory.files) {
            const entryMetadata = entry as ArchiveEntryMetadata;

            if (isArchiveSymlink(entryMetadata)) {
                continue;
            }

            const entrySize = getArchiveEntrySize(entryMetadata);
            if (entrySize > MAX_ARCHIVE_ENTRY_BYTES) {
                throw new Error("Archive entry is too large");
            }

            totalExtractedBytes += entrySize;
            if (totalExtractedBytes > MAX_ARCHIVE_TOTAL_BYTES) {
                throw new Error("Archive is too large");
            }

            const dest = resolveContainedPath(tempDir, entry.path);

            if (entry.type === "Directory") {
                await fs.mkdir(dest, { recursive: true });
                continue;
            }

            await fs.mkdir(path.dirname(dest), { recursive: true });
            const read = entry.stream();
            await pipeline(read, fsSync.createWriteStream(dest));
        }

        await fs.unlink(oszPath).catch(() => {});

        return tempDir;
    } catch (error) {
        console.error(`Error downloading mapset ${mapsetId}:`, error);
        await cleanupDirectory(tempDir);
        return null;
    }
}

async function extractBackground(mapsetId: number): Promise<string | null> {
    try {
        const imageFilename = `${mapsetId}.webp`;
        const destPath = path.join(MAPSET_DIRECTORIES.backgrounds, imageFilename);

        const imageUrl = `${OSU_COVERS_BASE_URL}/${mapsetId}/covers/fullsize.jpg`;
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        await sharp(buffer)
            .resize({
                width: 1920,
                height: 1080,
                fit: "inside",
                withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toFile(destPath);

        return imageFilename;
    } catch (error) {
        console.error(`Error downloading background for mapset ${mapsetId}:`, error);
        return null;
    }
}

async function findLargestAudioFile(mapsetDir: string): Promise<string> {
    const files = await fs.readdir(mapsetDir);
    const audioExtensions = new Set([".mp3", ".ogg", ".wav"]);
    const candidates: AudioImportCandidate[] = [];

    for (const file of files) {
        if (!audioExtensions.has(path.extname(file).toLowerCase())) continue;

        const stats = await fs.stat(path.join(mapsetDir, file));
        if (stats.isFile()) {
            candidates.push({
                name: file,
                size: stats.size,
                isValidMp3: path.extname(file).toLowerCase() === ".mp3" && (await isMp3File(path.join(mapsetDir, file))),
            });
        }
    }

    return selectAudioImportFile(candidates);
}

async function extractAudio(mapsetId: number, mapsetDir: string): Promise<string> {
    const largestAudio = await findLargestAudioFile(mapsetDir);
    const srcPath = path.join(mapsetDir, largestAudio);
    const audioFilename = `${mapsetId}.mp3`;
    const destPath = path.join(MAPSET_DIRECTORIES.audio, audioFilename);

    await fs.copyFile(srcPath, destPath);

    return audioFilename;
}

async function saveMapsetToDatabase(mapsetId: number, beatmapData: BeatmapData, imageFilename: string, audioFilename: string): Promise<void> {
    const metadata = {
        title: beatmapData.title,
        artist: beatmapData.artist,
        mapper: beatmapData.creator,
        rankedAt: beatmapData.rankedAt,
        starRatingMin: beatmapData.starRatingMin,
        starRatingMax: beatmapData.starRatingMax,
    };
    const media = { imageFilename, audioFilename };
    const where = { mapsetId };
    const save = () => prisma.$transaction([
        prisma.mapsetData.upsert({ where, create: { mapsetId, ...metadata }, update: metadata }),
        prisma.mapsetTag.upsert({ where, create: { mapsetId, ...media }, update: media }),
    ]);
    try {
        await save();
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2034"].includes(error.code)) throw error;
        await save();
    }
}

async function mapsetExists(mapsetId: number): Promise<boolean> {
    const row = await prisma.mapsetTag.findFirst({
        where: { mapsetId, data: { mapsetId } },
        select: { imageFilename: true, audioFilename: true },
    });
    if (!row?.imageFilename || !row.audioFilename) return false;

    try {
        const [image, audio] = await Promise.all([
            fs.stat(resolveMediaPath(MAPSET_DIRECTORIES.backgrounds, row.imageFilename)).catch(() => null),
            fs.stat(resolveMediaPath(MAPSET_DIRECTORIES.audio, row.audioFilename)).catch(() => null),
        ]);
        return Boolean(image?.isFile() && audio?.isFile());
    } catch {
        return false;
    }
}

async function removeMapsetFromDatabase(mapsetId: number): Promise<void> {
    await prisma.$transaction([
        prisma.mapsetTag.deleteMany({ where: { mapsetId } }),
        prisma.mapsetData.deleteMany({ where: { mapsetId } }),
    ]);
}

export async function importMapset(mapsetId: number): Promise<ImportMapsetResult> {
    let mapsetDir: string | null = null;
    let audioFilename: string | null = null;
    let imageFilename: string | null = null;
    let saved = false;

    try {
        const existing = await mapsetExists(mapsetId);
        if (existing) {
            saved = true;
            return { success: true, note: "already_exists" };
        }

        await ensureDirectories();

        const beatmapData = await getBeatmapData(mapsetId);
        if (!beatmapData) {
            throw new Error("Could not fetch beatmap data from osu! API");
        }

        mapsetDir = await downloadMapset(mapsetId);
        if (!mapsetDir) {
            throw new Error("Failed to download and extract mapset");
        }

        [audioFilename, imageFilename] = await Promise.all([extractAudio(mapsetId, mapsetDir), extractBackground(mapsetId)]);

        if (!audioFilename) {
            throw new Error("Failed to process audio file");
        }

        if (!imageFilename) {
            throw new Error("Failed to download background image");
        }

        await saveMapsetToDatabase(mapsetId, beatmapData, imageFilename, audioFilename);
        saved = true;
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error adding mapset ${mapsetId}:`, errorMessage);
        return { success: false, error: errorMessage };
    } finally {
        if (mapsetDir) await cleanupDirectory(mapsetDir);
        if (!saved) {
            await Promise.all([
                audioFilename ? fs.unlink(path.join(MAPSET_DIRECTORIES.audio, audioFilename)).catch(() => {}) : Promise.resolve(),
                imageFilename ? fs.unlink(path.join(MAPSET_DIRECTORIES.backgrounds, imageFilename)).catch(() => {}) : Promise.resolve(),
            ]);
        }
    }
}

export function parseMapsetIds(fileContent: string): number[] {
    return [...new Set(fileContent.split("\n").map((line) => line.match(/beatmapsets\/(\d+)/)?.[1]).filter((id): id is string => id !== undefined).map(Number))];
}

export async function deleteMapset(mapsetId: number): Promise<void> {
    try {
        const files = await prisma.mapsetTag.findUnique({ where: { mapsetId } });
        const { imageFilename: image_filename, audioFilename: audio_filename } = files ?? {};
        const imagePath = image_filename ? resolveMediaPath(MAPSET_DIRECTORIES.backgrounds, image_filename) : null;
        const audioPath = audio_filename ? resolveMediaPath(MAPSET_DIRECTORIES.audio, audio_filename) : null;

        await removeMapsetFromDatabase(mapsetId);

        await Promise.all([
            imagePath ? fs.unlink(imagePath).catch(() => console.warn(`Background file ${image_filename} not found`)) : Promise.resolve(),
            audioPath ? fs.unlink(audioPath).catch(() => console.warn(`Audio file ${audio_filename} not found`)) : Promise.resolve(),
        ]);

        console.log(`Removed mapset ${mapsetId}`);
    } catch (error) {
        console.error(`Error removing mapset ${mapsetId}:`, error);
        throw error;
    }
}
