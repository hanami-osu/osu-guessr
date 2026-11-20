"use server";

import { prisma } from "@/lib/database/prisma";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { requireAdmin } from "@/actions/require-admin";
import { MAPSET_DIRECTORIES, deleteMapset, importMapset, parseMapsetIds, resolveMediaPath, type ImportMapsetResult } from "@/lib/media/mapset-import";

const MAX_BULK_MAPSETS = 50;

export interface Mapset {
    mapset_id: number;
    title: string;
    artist: string;
    mapper: string;
    image_filename: string;
    audio_filename: string;
}

export async function addMapset(rawMapsetId: number): Promise<ImportMapsetResult> {
    await requireAdmin();
    const mapsetId = z.coerce.number().min(1).parse(rawMapsetId);
    return importMapset(mapsetId);
}

export async function addMapsetFromList(fileContent: string) {
    await requireAdmin();
    const mapsetIds = parseMapsetIds(fileContent);

    if (mapsetIds.length > MAX_BULK_MAPSETS) {
        throw new Error(`Too many mapsets. Maximum is ${MAX_BULK_MAPSETS}.`);
    }

    const total = mapsetIds.length;
    const results: Array<{ id: number; success: boolean; error?: string; note?: string }> = [];

    console.log(`Found ${total} mapsets to process.`);

    for (let i = 0; i < mapsetIds.length; i++) {
        const mapsetId = mapsetIds[i];
        try {
            const result = await importMapset(mapsetId);
            if (result.success) {
                results.push({ id: mapsetId, success: true, note: result.note });
            } else {
                results.push({ id: mapsetId, success: false, error: result.error });
            }
        } catch (error) {
            results.push({ id: mapsetId, success: false, error: String(error) });
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
    await requireAdmin();
    await deleteMapset(z.coerce.number().min(1).parse(rawMapsetId));
}

export async function listMapsets(page = 1, limit = 50, q?: string): Promise<Mapset[]> {
    try {
        await requireAdmin();
        const args = z
            .object({
                page: z.coerce.number().min(1).default(1),
                limit: z.coerce.number().min(1).max(50).default(50),
                q: z.string().optional(),
            })
            .parse({ page, limit, q });

        const offset = (args.page - 1) * args.limit;

        const search = args.q?.trim().toLowerCase();
        const mapsets = await prisma.mapsetData.findMany({
            where: {
                tag: { isNot: null },
                ...(search ? { OR: [{ artist: { contains: search } }, { title: { contains: search } }] } : {}),
            },
            select: { mapsetId: true, title: true, artist: true, mapper: true, tag: { select: { imageFilename: true, audioFilename: true } } },
            orderBy: [{ artist: "desc" }, { mapsetId: "asc" }],
            take: args.limit,
            skip: offset,
        });
        return mapsets.flatMap(({ mapsetId, title, artist, mapper, tag }) => tag ? [{
            mapset_id: mapsetId, title: title ?? "", artist: artist ?? "", mapper: mapper ?? "",
            image_filename: tag.imageFilename ?? "", audio_filename: tag.audioFilename ?? "",
        }] : []);
    } catch (error) {
        console.error("Error listing mapsets:", error);
        return [];
    }
}

export async function fetchBackgroundImage(filename?: string | null): Promise<string | null> {
    await requireAdmin();
    if (!filename) return null;

    try {
        const filePath = resolveMediaPath(MAPSET_DIRECTORIES.backgrounds, filename);
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
