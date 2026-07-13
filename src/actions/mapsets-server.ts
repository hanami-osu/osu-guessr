"use server";

import { query } from "@/lib/database";
import { env } from "@/lib/env";
import redisClient from "@/lib/redis";
import { authenticatedAction } from "./server";
import { getMediaData } from "./media";

import { GameMode, type MapsetTags, type MapsetData, type MapsetDataWithTags, type SkinData } from "./types";
import { NoGameContentError } from "@/lib/game/content-errors";

export async function getRandomAudioAction(sessionId?: string) {
    return authenticatedAction(async () => {
        const audio = await getRandomAudio(sessionId);
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

async function getRandomAudio(sessionId?: string): Promise<MapsetDataWithTags | null> {
    let excludedIds: number[] = [];
    if (sessionId) {
        const cacheKey = `session_items:${sessionId}:mapset`;
        const cachedRaw = await redisClient.sMembers(cacheKey);
        const cached = Array.isArray(cachedRaw) ? cachedRaw : [];
        if (cached.length > 0) {
            excludedIds = cached.map((id) => Number(id)).filter(Boolean);
        }
    }

    const tagResults: Array<MapsetTags> = await query(
        `SELECT * FROM mapset_tags
            WHERE audio_filename IS NOT NULL
            AND audio_filename <> ''
            AND mapset_id NOT IN (${excludedIds.length ? excludedIds.map(() => "?").join(",") : "0"})
            ORDER BY RAND() LIMIT 1;`,
        excludedIds
    );

    if (!tagResults.length) {
        return null;
    }

    const tags = tagResults[0];

    const mapsetResults: Array<MapsetData> = await query(`SELECT * FROM mapset_data WHERE mapset_id = ?`, [tags.mapset_id]);

    let mapset: MapsetData;

    if (mapsetResults.length > 0) {
        mapset = mapsetResults[0];
    } else {
        const data = await getMapsetById(tags.mapset_id);
        if (!data) {
            return null;
        }

        mapset = data;
        await query(
            `INSERT INTO mapset_data (mapset_id, title, artist, mapper)
             VALUES (?, ?, ?, ?)`,
            [mapset.mapset_id, mapset.title, mapset.artist, mapset.mapper]
        );
    }

    return { ...tags, ...mapset };
}

export async function getRandomBackgroundAction(sessionId?: string) {
    return authenticatedAction(async () => {
        const background = await getRandomBackground(sessionId);
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

async function getRandomBackground(sessionId?: string): Promise<MapsetDataWithTags | null> {
    let excludedIds: number[] = [];
    if (sessionId) {
        const cacheKey = `session_items:${sessionId}:mapset`;
        const cachedRaw = await redisClient.sMembers(cacheKey);
        const cached = Array.isArray(cachedRaw) ? cachedRaw : [];
        if (cached.length > 0) {
            excludedIds = cached.map((id) => Number(id)).filter(Boolean);
        }
    }

    const tagResults: Array<MapsetTags> = await query(
        `SELECT * FROM mapset_tags
            WHERE mapset_id IS NOT NULL
            AND image_filename IS NOT NULL
            AND image_filename <> ''
            AND mapset_id NOT IN (${excludedIds.length ? excludedIds.map(() => "?").join(",") : "0"})
            ORDER BY RAND() LIMIT 1;`,
        excludedIds
    );

    if (!tagResults.length) {
        return null;
    }

    const tags = tagResults[0];

    const mapsetResults: Array<MapsetData> = await query(`SELECT * FROM mapset_data WHERE mapset_id = ?`, [tags.mapset_id]);
    let mapset: MapsetData;

    if (mapsetResults.length > 0) {
        mapset = mapsetResults[0];
    } else {
        const data = await getMapsetById(tags.mapset_id);
        if (!data) {
            return null;
        }

        mapset = data;
        await query(`INSERT INTO mapset_data (mapset_id, title, artist, mapper) VALUES (?, ?, ?, ?)`, [mapset.mapset_id, mapset.title, mapset.artist, mapset.mapper]);
    }

    return { ...tags, ...mapset };
}

async function getMapsetById(mapsetId: number): Promise<MapsetData | null> {
    const res = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${env.OSU_API_KEY}&s=${mapsetId}`);

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
    let excludedIds: number[] = [];
    if (sessionId) {
        const cacheKey = `session_items:${sessionId}:skin`;
        const cachedRaw = await redisClient.sMembers(cacheKey);
        const cached = Array.isArray(cachedRaw) ? cachedRaw : [];
        if (cached.length > 0) {
            excludedIds = cached.map((id) => Number(id)).filter(Boolean);
        }
    }
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
