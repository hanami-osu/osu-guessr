"use server";

import { query } from "@/lib/database";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireOwner } from "@/actions/require-owner";
import { parseSkinApiResponse, type SkinImportData } from "@/lib/skin-import";
import sharp from "sharp";

const DIRECTORIES = {
    skins: path.join(process.cwd(), "mapsets", "skins"),
    temp: path.join(process.cwd(), "tmp"),
} as const;

const OSUCK_API_KEY = env.OSUCK_API_KEY;
const OSUCK_API_BASE_URL = env.OSUCK_API_BASE;
const MAX_BULK_SKINS = 50;
const GAMEPLAY_SCREENSHOT_CATEGORY = 6;
const IMPORT_DELAY_MS = 1000;

interface SkinProcessResult {
    success: boolean;
    skinId?: number;
    image?: string;
    error?: string;
}

interface DatabaseSkin {
    id: number;
    name: string;
    image_filename: string;
    created_at: string;
}

async function ensureDirectories(): Promise<void> {
    const directories = Object.values(DIRECTORIES);
    await Promise.all(directories.map((dir) => fs.mkdir(dir, { recursive: true })));
}

async function fetchSkinMetadata(skinId: number): Promise<SkinImportData> {
    if (!OSUCK_API_KEY || !OSUCK_API_BASE_URL) {
        throw new Error("The osu!ck API integration is not configured");
    }

    const url = `${OSUCK_API_BASE_URL}?key=${OSUCK_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ skins: [skinId] }),
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }

    return parseSkinApiResponse(await response.json(), skinId);
}

async function downloadSkin(skinData: SkinImportData): Promise<{ fileName: string; tempPath: string }> {
    const gameplayCategory = skinData.screenshots.find((screenshot) => screenshot.category === GAMEPLAY_SCREENSHOT_CATEGORY);
    if (!gameplayCategory) {
        throw new Error("No gameplay screenshot found for this skin");
    }

    const fileName = `${skinData.id}.webp`;
    const tempPath = path.join(DIRECTORIES.temp, `skin-${skinData.id}-${crypto.randomUUID()}.webp`);
    const response = await fetch(gameplayCategory.large);

    if (!response.ok) {
        throw new Error(`Failed to download screenshot: ${response.status}`);
    }

    const downloadedImage = Buffer.from(await response.arrayBuffer());
    await sharp(downloadedImage).webp({ quality: 80 }).toFile(tempPath);
    return { fileName, tempPath };
}

function resolveSkinPath(filename: string): string {
    if (!filename || path.basename(filename) !== filename || filename.includes("\\") || filename.includes("\0")) {
        throw new Error("Invalid skin filename");
    }
    return path.join(DIRECTORIES.skins, filename);
}

async function saveSkinToDatabase(skinData: SkinImportData, imageFilename: string): Promise<void> {
    await query(
        `INSERT INTO skins (id, name, image_filename)
     VALUES (?, ?, ?)`,
        [skinData.id, skinData.name, imageFilename]
    );
}

async function removeSkinFromDatabase(id: number): Promise<void> {
    await query("DELETE FROM skins WHERE id = ?", [id]);
}

async function importSkin(id: number): Promise<{ skinId: number; image: string }> {
    const skinData = await fetchSkinMetadata(id);
    const { fileName, tempPath } = await downloadSkin(skinData);
    let saved = false;

    try {
        await saveSkinToDatabase(skinData, fileName);
        saved = true;
        await fs.rename(tempPath, resolveSkinPath(fileName));
        return { skinId: skinData.id, image: fileName };
    } catch (error) {
        if (saved) await removeSkinFromDatabase(skinData.id);
        throw error;
    } finally {
        await fs.unlink(tempPath).catch(() => {});
    }
}

export async function addSkinById(rawSkinId: number): Promise<SkinProcessResult> {
    await requireOwner();
    const skinId = z.coerce.number().min(1).parse(rawSkinId);
    console.log(`Processing skin ID: ${skinId}`);

    try {
        await ensureDirectories();
        const imported = await importSkin(skinId);

        return {
            success: true,
            ...imported,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error adding skin ${skinId}:`, errorMessage);

        return {
            success: false,
            error: errorMessage,
        };
    }
}

export async function addSkinsFromList(rawIds: number[]): Promise<Array<{ id: number; success: boolean; error?: string; image?: string }>> {
    await requireOwner();
    const ids = [...new Set(z.array(z.coerce.number().min(1)).max(MAX_BULK_SKINS).parse(rawIds))];
    const results: Array<{ id: number; success: boolean; error?: string; image?: string }> = [];
    await ensureDirectories();

    for (const [index, id] of ids.entries()) {
        console.log(`Processing skin ${index + 1}/${ids.length}: ${id}`);

        try {
            const imported = await importSkin(id);
            results.push({ id, success: true, image: imported.image });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            results.push({ id, success: false, error: errorMessage });
        }

        if (index < ids.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, IMPORT_DELAY_MS));
        }
    }

    const successful = results.filter((r) => r.success).length;
    console.log(`Successfully processed ${successful}/${ids.length} skins`);

    return results;
}

export async function listSkins(): Promise<DatabaseSkin[]> {
    try {
        await requireOwner();
        const skins = await query(`
      SELECT * FROM skins 
      ORDER BY created_at DESC
    `);

        return skins as DatabaseSkin[];
    } catch (error) {
        console.error("Error listing skins:", error);
        return [];
    }
}

export async function removeSkin(rawId: number): Promise<{ success: boolean; error?: string }> {
    try {
        await requireOwner();
        const id = z.coerce.number().min(1).parse(rawId);
        const rows = (await query("SELECT image_filename FROM skins WHERE id = ?", [id])) as Array<{ image_filename?: string }>;
        const imageFilename = rows[0]?.image_filename;
        const imagePath = imageFilename ? resolveSkinPath(imageFilename) : null;

        await removeSkinFromDatabase(id);

        if (imagePath) {
            await fs.unlink(imagePath).catch(() => console.warn(`Image file ${imageFilename} not found`));
        }

        console.log(`Successfully removed skin ${id}`);
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error removing skin ${rawId}:`, errorMessage);

        return {
            success: false,
            error: errorMessage,
        };
    }
}
