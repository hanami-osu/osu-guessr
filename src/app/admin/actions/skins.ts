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

    try {
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
    } catch (error) {
        console.error(`Failed to fetch skin metadata for ${skinId} :`, error);
        throw error;
    }
}

async function downloadSkin(skinData: SkinImportData): Promise<string> {
    const gameplayCategory = skinData.screenshots.find((screenshot) => screenshot.category === 6); // 6 is for the gameplay category of the skin
    if (!gameplayCategory) {
        throw new Error("No gameplay screenshot found for this skin");
    }

    const fileName = `${skinData.id}.webp`;
    const imagePath = path.join(DIRECTORIES.skins, fileName);

    try {
        const response = await fetch(gameplayCategory.large);

        if (!response.ok) {
            throw new Error(`Failed to download screenshot: ${response.status}`);
        }

        const downloadedImage = Buffer.from(await response.arrayBuffer());
        await sharp(downloadedImage).webp({ quality: 80 }).toFile(imagePath);

        return fileName;
    } catch (error) {
        console.error(`Error downloading screenshot for skin ${skinData.id}:`, error);
        throw error;
    }
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

export async function addSkinById(rawSkinId: number): Promise<SkinProcessResult> {
    await requireOwner();
    const skinId = z.coerce.number().min(1).parse(rawSkinId);
    console.log(`Processing skin ID: ${skinId}`);

    try {
        await ensureDirectories();
        const skinData = await fetchSkinMetadata(skinId);

        const skinFileName = await downloadSkin(skinData);

        await saveSkinToDatabase(skinData, skinFileName);

        return {
            success: true,
            skinId: skinData.id,
            image: skinFileName,
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
    const ids = z.array(z.coerce.number().min(1)).max(MAX_BULK_SKINS).parse(rawIds);
    const results: Array<{ id: number; success: boolean; error?: string; image?: string }> = [];
    await ensureDirectories();

    for (const [index, id] of ids.entries()) {
        console.log(`Processing skin ${index + 1}/${ids.length}: ${id}`);

        try {
            const skinData = await fetchSkinMetadata(id);

            const image = await downloadSkin(skinData);

            await saveSkinToDatabase(skinData, image);

            results.push({ id, success: true, image });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            results.push({ id, success: false, error: errorMessage });
        }

        // small delay between downloads to be polite to ck :)
        if (index < ids.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
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

        if (rows.length > 0 && rows[0]?.image_filename) {
            const imagePath = path.join(DIRECTORIES.skins, rows[0].image_filename);
            await fs.unlink(imagePath).catch(() => console.warn(`Image file ${rows[0].image_filename} not found`));
        }

        await removeSkinFromDatabase(id);

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
