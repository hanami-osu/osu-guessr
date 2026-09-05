import "server-only";

import { query } from "@/lib/database";
import { env } from "@/lib/env";
import redisClient from "@/lib/redis";
import { authenticatedAction } from "./server";
import { getMediaData } from "./media";

import { GameMode, type MapsetTags, type MapsetData, type MapsetDataWithTags, type SkinData } from "./types";
import { NoGameContentError } from "@/lib/game/content-errors";

export async function getRandomAudioAction(sessionId?: string) {
    return authenticatedAction(async () => {
        const audio = await getRandomMapset("audio_filename", sessionId);
        if (!audio) {
            throw new NoGameContentError("No audio found");
        }

        const audioData = await getMediaData(GameMode.Audio, audio.audio_filename);

        return {
            data: audio,
            audioData,
        };
    });
}

export async function getRandomBackgroundAction(sessionId?: string) {
    return authenticatedAction(async () => {
        const background = await getRandomMapset("image_filename", sessionId);
        if (!background) {
            throw new NoGameContentError("No background found");
        }

        const backgroundImageData = await getMediaData(GameMode.Background, background.image_filename);

        return {
            data: background,
            backgroundData: backgroundImageData,
        };
    });
}

async function getExcludedIds(sessionId: string | undefined, itemType: "mapset" | "skin"): Promise<number[]> {
    if (!sessionId) return [];
    return (await redisClient.sMembers(`session_items:${sessionId}:${itemType}`)).map(Number).filter(Boolean);
}

async function getRandomMapset(filenameColumn: "audio_filename" | "image_filename", sessionId?: string): Promise<MapsetDataWithTags | null> {
    const excludedIds = await getExcludedIds(sessionId, "mapset");
    const [tags] = await query<MapsetTags>(
        `SELECT * FROM mapset_tags
         WHERE ${filenameColumn} IS NOT NULL
           AND ${filenameColumn} <> ''
           AND mapset_id NOT IN (${excludedIds.length ? excludedIds.map(() => "?").join(",") : "0"})
         ORDER BY RAND() LIMIT 1`,
        excludedIds,
    );
    if (!tags) return null;

    const [storedMapset] = await query<MapsetData>("SELECT * FROM mapset_data WHERE mapset_id = ?", [tags.mapset_id]);
    const mapset = storedMapset ?? (await getMapsetById(tags.mapset_id));
    if (!mapset) return null;

    if (!storedMapset) {
        await query("INSERT INTO mapset_data (mapset_id, title, artist, mapper) VALUES (?, ?, ?, ?)", [mapset.mapset_id, mapset.title, mapset.artist, mapset.mapper]);
    }

    return { ...tags, ...mapset };
}

async function getMapsetById(mapsetId: number): Promise<MapsetData | null> {
    const res = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${env.OSU_API_KEY}&s=${mapsetId}`, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) {
        return null;
    }

    const data = (await res.json())[0];
    return { mapset_id: data.beatmapset_id, title: data.title, artist: data.artist, mapper: data.creator };
}

export async function getRandomSkinAction(sessionId?: string) {
    return authenticatedAction(async () => {
        const skin = await getRandomSkin(sessionId);
        if (!skin) {
            throw new NoGameContentError("No skin found");
        }

        const skinData = await getMediaData(GameMode.Skin, skin.image_filename);

        return {
            data: skin,
            skinData,
        };
    });
}

async function getRandomSkin(sessionId?: string): Promise<SkinData | null> {
    const excludedIds = await getExcludedIds(sessionId, "skin");
    const excludedCondition = excludedIds.length > 0 ? `AND id NOT IN (${excludedIds.map(() => "?").join(",")})` : "";
    const params = excludedIds;

    const result = await query(
        `SELECT * 
         FROM skins
         WHERE image_filename IS NOT NULL
         AND image_filename <> ''
         ${excludedCondition}
         ORDER BY RAND()
         LIMIT 1`,
        params
    );

    return result.length > 0 ? (result[0] as SkinData) : null;
}
