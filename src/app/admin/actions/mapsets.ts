"use server";

import { query } from "@/lib/database";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import unzipper from "unzipper";
import sharp from "sharp";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireOwner } from "@/actions/require-owner";
import { selectAudioImportFile, type AudioImportCandidate } from "@/lib/importer-validation";

const DIRECTORIES = {
    audio: path.join(process.cwd(), "mapsets", "audio"),
    backgrounds: path.join(process.cwd(), "mapsets", "backgrounds"),
    temp: path.join(process.cwd(), "tmp"),
} as const;

const OSU_API_KEY = env.OSU_API_KEY;
const BEATCONNECT_BASE_URL = "https://beatconnect.io/b";
const OSU_COVERS_BASE_URL = "https://assets.ppy.sh/beatmaps";
const OSU_API_BASE_URL = "https://osu.ppy.sh/api/get_beatmaps";
const MAX_BULK_MAPSETS = 50;
const MAX_ARCHIVE_FILES = 1000;
const MAX_ARCHIVE_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 100 * 1024 * 1024;

export interface Mapset {
    mapset_id: number;
    title: string;
    artist: string;
    mapper: string;
    image_filename: string;
    audio_filename: string;
}

interface AddMapsetResult {
    success: boolean;
    note?: "already_exists";
    error?: string;
}

interface BeatmapData {
    title: string;
    artist: string;
    creator: string;
}

interface OsuApiResponse {
    title: string;
    artist: string;
    creator: string;
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

function resolveBackgroundPath(filename: string): string {
    if (!filename || filename.includes("\0") || filename.includes("/") || filename.includes("\\") || filename.includes("..") || path.isAbsolute(filename)) {
        throw new Error("Invalid filename");
    }

    const baseDir = path.resolve(DIRECTORIES.backgrounds);
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
    const directories = Object.values(DIRECTORIES);
    await Promise.all(directories.map((dir) => fs.mkdir(dir, { recursive: true })));
    console.log("Directories exist");
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

        return {
            title: data[0].title,
            artist: data[0].artist,
            creator: data[0].creator,
        };
    } catch (error) {
        console.error(`Failed to fetch beatmap data for ${mapsetId}:`, error);
        return null;
    }
}

async function downloadMapset(mapsetId: number): Promise<string | null> {
    const tempDir = path.join(DIRECTORIES.temp, mapsetId.toString());
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

        // remove the downloaded archive
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
        const destPath = path.join(DIRECTORIES.backgrounds, imageFilename);

        const imageUrl = `${OSU_COVERS_BASE_URL}/${mapsetId}/covers/fullsize.jpg`;
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Process and compress the image
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

// Audio Processing
async function findLargestAudioFile(mapsetDir: string): Promise<string> {
    const files = await fs.readdir(mapsetDir);
    const audioExtensions = new Set([".mp3", ".ogg", ".wav"]);
    const candidates: AudioImportCandidate[] = [];

    for (const file of files) {
        if (!audioExtensions.has(path.extname(file).toLowerCase())) continue;

        const stats = await fs.stat(path.join(mapsetDir, file));
        if (stats.isFile()) {
            candidates.push({ name: file, size: stats.size });
        }
    }

    return selectAudioImportFile(candidates);
}

async function extractAudio(mapsetId: number, mapsetDir: string): Promise<string> {
    const largestAudio = await findLargestAudioFile(mapsetDir);
    const srcPath = path.join(mapsetDir, largestAudio);
    const audioFilename = `${mapsetId}.mp3`;
    const destPath = path.join(DIRECTORIES.audio, audioFilename);

    await fs.copyFile(srcPath, destPath);

    return audioFilename;
}

async function saveMapsetToDatabase(mapsetId: number, beatmapData: BeatmapData, imageFilename: string, audioFilename: string): Promise<void> {
    await query(
        `INSERT INTO mapset_data (mapset_id, title, artist, mapper)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       artist = VALUES(artist),
       mapper = VALUES(mapper)`,
        [mapsetId, beatmapData.title, beatmapData.artist, beatmapData.creator],
    );

    await query(
        `INSERT INTO mapset_tags (mapset_id, image_filename, audio_filename)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       image_filename = VALUES(image_filename),
       audio_filename = VALUES(audio_filename)`,
        [mapsetId, imageFilename, audioFilename],
    );
}

async function mapsetExists(mapsetId: number): Promise<boolean> {
    try {
        const rows = await query("SELECT 1 FROM mapset_data WHERE mapset_id = ? LIMIT 1", [mapsetId]);
        if (Array.isArray(rows)) {
            return rows.length > 0;
        }
        return Boolean(rows && Object.keys(rows).length > 0);
    } catch (error) {
        console.error(`Error checking mapset existence for ${mapsetId}:`, error);
        return false;
    }
}

async function removeMapsetFromDatabase(mapsetId: number): Promise<void> {
    await query("DELETE FROM mapset_tags WHERE mapset_id = ?", [mapsetId]);
    await query("DELETE FROM mapset_data WHERE mapset_id = ?", [mapsetId]);
}

export async function addMapset(rawMapsetId: number): Promise<AddMapsetResult> {
    await requireOwner();
    const mapsetId = z.coerce.number().min(1).parse(rawMapsetId);
    console.log(`Processing mapset ID: ${mapsetId}`);

    try {
        const existing = await mapsetExists(mapsetId);
        if (existing) {
            console.log(`Mapset ${mapsetId} already exists in the database. Skipping download.`);
            return { success: true, note: "already_exists" };
        }

        await ensureDirectories();

        const beatmapData = await getBeatmapData(mapsetId);
        if (!beatmapData) {
            throw new Error("Could not fetch beatmap data from osu! API");
        }

        const mapsetDir = await downloadMapset(mapsetId);
        if (!mapsetDir) {
            throw new Error("Failed to download and extract mapset");
        }

        const [audioFilename, imageFilename] = await Promise.all([extractAudio(mapsetId, mapsetDir), extractBackground(mapsetId)]);

        if (!audioFilename) {
            throw new Error("Failed to process audio file");
        }

        if (!imageFilename) {
            throw new Error("Failed to download background image");
        }

        await saveMapsetToDatabase(mapsetId, beatmapData, imageFilename, audioFilename);

        await cleanupDirectory(mapsetDir);

        console.log(`Successfully added mapset ${mapsetId}`);
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error adding mapset ${mapsetId}:`, errorMessage);
        return { success: false, error: errorMessage };
    }
}

export async function addMapsetFromList(fileContent: string) {
    await requireOwner();
    const mapsetIds = fileContent
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/beatmapsets\/(\d+)/);
            return match ? parseInt(match[1]) : null;
        })
        .filter((id): id is number => id !== null);

    if (mapsetIds.length > MAX_BULK_MAPSETS) {
        throw new Error(`Too many mapsets. Maximum is ${MAX_BULK_MAPSETS}.`);
    }

    console.log(mapsetIds);

    const total = mapsetIds.length;
    const results: Array<{ id: number; success: boolean; error?: string; note?: string }> = [];

    console.log(`Found ${total} mapsets to process.`);

    for (let i = 0; i < mapsetIds.length; i++) {
        const mapsetId = mapsetIds[i];
        const progress = (((i + 1) / total) * 100).toFixed(1);

        console.log(`[${progress}%] Processing mapset ${mapsetId} (${i + 1}/${total})`);

        try {
            const exists = await mapsetExists(mapsetId);
            if (exists) {
                results.push({ id: mapsetId, success: true, note: "already_exists" });
                console.log(`→ Mapset ${mapsetId}: Already exists in database. Skipping.`);
            } else {
                const result = await addMapset(mapsetId);
                if (result.success) {
                    results.push({ id: mapsetId, success: true, note: result.note });
                    console.log(`✓ Mapset ${mapsetId}: Successfully added`);
                } else {
                    results.push({ id: mapsetId, success: false, error: result.error });
                    console.log(`✗ Mapset ${mapsetId}: Failed - ${result.error}`);
                }
            }
        } catch (error) {
            results.push({ id: mapsetId, success: false, error: String(error) });
            console.log(`✗ Mapset ${mapsetId}: Failed - ${error}`);
        }
    }

    return {
        total,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
    };
}

export async function removeMapset(rawMapsetId: number): Promise<void> {
    await requireOwner();
    const mapsetId = z.coerce.number().min(1).parse(rawMapsetId);
    try {
        const files = (await query("SELECT image_filename, audio_filename FROM mapset_tags WHERE mapset_id = ?", [mapsetId])) as Array<{ image_filename?: string; audio_filename?: string }>;

        if (files.length > 0 && files[0]) {
            const { image_filename, audio_filename } = files[0];

            const fileRemovalPromises = [];

            if (image_filename) {
                const imagePath = path.join(DIRECTORIES.backgrounds, image_filename);
                fileRemovalPromises.push(fs.unlink(imagePath).catch(() => console.warn(`Background file ${image_filename} not found`)));
            }

            if (audio_filename) {
                const audioPath = path.join(DIRECTORIES.audio, audio_filename);
                fileRemovalPromises.push(fs.unlink(audioPath).catch(() => console.warn(`Audio file ${audio_filename} not found`)));
            }

            await Promise.all(fileRemovalPromises);
        }

        await removeMapsetFromDatabase(mapsetId);

        console.log(`Successfully removed mapset ${mapsetId}`);
    } catch (error) {
        console.error(`Error removing mapset ${mapsetId}:`, error);
        throw error;
    }
}

export async function listMapsets(page = 1, limit = 50, q?: string): Promise<Mapset[]> {
    try {
        await requireOwner();
        const args = z
            .object({
                page: z.coerce.number().min(1).default(1),
                limit: z.coerce.number().min(1).max(50).default(50),
                q: z.string().optional(),
            })
            .parse({ page, limit, q });

        const offset = (args.page - 1) * args.limit;

        let sql = `
            SELECT
                md.mapset_id,
                md.title,
                md.artist,
                md.mapper,
                mt.image_filename,
                mt.audio_filename
            FROM mapset_data md
            JOIN mapset_tags mt ON md.mapset_id = mt.mapset_id
        `;

        const params: (string | number)[] = [];

        if (args.q && args.q.trim().length > 0) {
            sql += ` WHERE LOWER(md.artist) LIKE ? OR LOWER(md.title) LIKE ? `;
            const like = `%${args.q.toLowerCase().trim()}%`;
            params.push(like, like);
        }

        sql += ` ORDER BY md.artist DESC LIMIT ? OFFSET ? `;
        params.push(args.limit, offset);

        const mapsets = await query(sql, params);

        return (mapsets as Mapset[]) || [];
    } catch (error) {
        console.error("Error listing mapsets:", error);
        return [];
    }
}

export async function fetchBackgroundImage(filename?: string | null): Promise<string | null> {
    await requireOwner();
    if (!filename) return null;

    try {
        const filePath = resolveBackgroundPath(filename);
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats || !stats.isFile()) return null;

        const buffer = await fs.readFile(filePath);
        const ext = path.extname(filename).toLowerCase();
        const mime = ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";

        const base64 = Buffer.from(buffer).toString("base64");
        return `data:${mime};base64,${base64}`;
    } catch (error) {
        console.error(`Error reading background ${filename}:`, error);
        return null;
    }
}
