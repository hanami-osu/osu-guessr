import { query } from "../database";
import { env } from "../env";
import redisClient from "../redis";
import { getMediaData } from "@/actions/media";

import { GameMode, type MapsetTags, type MapsetData, type MapsetDataWithTags, type SkinData } from "@/actions/types";
import { NoGameContentError } from "@/lib/game/content-errors";
import { DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED, DAILY_EPOCH_UTC, DAILY_ROUNDS, getDailyItemId } from "@/lib/game/daily";
import { prisma } from "@/lib/database/prisma";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "./versioning";
import { acquireRedisLock, releaseRedisLock } from "../redis-lock-core";
import { z } from "zod";

export async function getRandomAudio(sessionId?: string) {
    const audio = await getRandomMapset("audio_filename", sessionId);
    if (!audio) {
        throw new NoGameContentError("No audio found");
    }

    const audioData = await getMediaData(GameMode.Audio, audio.audio_filename);

    return {
        data: audio,
        audioData,
    };
}

export async function getDailyAudio(day: number, round: number) {
    const audio = await getDailyMapset("audio_filename", day, GameMode.Audio, round);
    if (!audio) throw new NoGameContentError("No daily audio found");
    return { data: audio, audioData: await getMediaData(GameMode.Audio, audio.audio_filename) };
}

export async function getRandomBackground(sessionId?: string) {
    const background = await getRandomMapset("image_filename", sessionId);
    if (!background) {
        throw new NoGameContentError("No background found");
    }

    const backgroundImageData = await getMediaData(GameMode.Background, background.image_filename);

    return {
        data: background,
        backgroundData: backgroundImageData,
    };
}

export async function getDailyBackground(day: number, round: number) {
    const background = await getDailyMapset("image_filename", day, GameMode.Background, round);
    if (!background) throw new NoGameContentError("No daily background found");
    return { data: background, backgroundData: await getMediaData(GameMode.Background, background.image_filename) };
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

    return getMapsetWithTags(tags);
}

async function getDailyMapset(filenameColumn: "audio_filename" | "image_filename", day: number, gameMode: GameMode, round: number): Promise<MapsetDataWithTags | null> {
    const dailyDate = new Date(DAILY_EPOCH_UTC + (day - 1) * 86_400_000);
    let challenge = await prisma.gameChallenge.findUnique({
        where: { dailyDate_gameMode_variant: { dailyDate, gameMode, variant: "classic" } },
    });
    if (!challenge) {
        const lock = await acquireRedisLock(`daily_map_pool:${dailyDate.toISOString().slice(0, 10)}`, 60_000);
        if (!lock) throw new Error("Daily map pool is being initialized; retry shortly");
        try {
            challenge = await prisma.gameChallenge.findUnique({
                where: { dailyDate_gameMode_variant: { dailyDate, gameMode, variant: "classic" } },
            });
            if (!challenge) challenge = await createDailyMapChallenge(filenameColumn, dailyDate, day, gameMode, env.DEBUG_DAILY_REUSE_CHECK);
        } finally {
            await releaseRedisLock(lock);
        }
    }

    const challengeRound = await prisma.gameChallengeRound.findUnique({
        where: { challengeId_roundNumber: { challengeId: challenge.id, roundNumber: round } },
    });
    if (!challengeRound || challengeRound.itemType !== "mapset") return null;
    const [selectedTags] = await query<MapsetTags>(`SELECT * FROM mapset_tags WHERE mapset_id = ? AND ${filenameColumn} IS NOT NULL AND ${filenameColumn} <> ''`, [challengeRound.itemId]);
    return selectedTags ? getMapsetWithTags(selectedTags) : null;
}

async function createDailyMapChallenge(filenameColumn: "audio_filename" | "image_filename", dailyDate: Date, day: number, gameMode: GameMode, checkRepetition: boolean, manuallySet = false) {
    const availableTags = await query<MapsetTags>(
        `SELECT * FROM mapset_tags
         WHERE ${filenameColumn} IS NOT NULL AND ${filenameColumn} <> ''
         ORDER BY mapset_id`,
    );
    const currentDate = dailyDate.toISOString().slice(0, 10);
    const poolTags = checkRepetition ? await excludeRecentDailyMapsets(availableTags, dailyDate, gameMode) : availableTags;
    const configSnapshot = {
        difficultyBand: "middle-60-percent",
        excludedRecentDays: checkRepetition ? 7 : 0,
        manuallySet,
        ignoreRepetitionChecks: !checkRepetition,
    };
    if (poolTags.length < DAILY_ROUNDS) throw new NoGameContentError("Not enough unused mapsets for today's Daily Challenge");

    const difficultyRows = await prisma.contentStat.findMany({
        where: {
            gameMode,
            itemType: "mapset",
            rulesetVersion: CURRENT_RULESET_VERSION,
            ppVersion: CURRENT_PP_VERSION,
            itemId: { in: poolTags.map(({ mapset_id }) => mapset_id) },
        },
        select: { itemId: true, empiricalDifficulty: true },
    });
    const difficultyById = new Map(difficultyRows.map((row) => [row.itemId, row.empiricalDifficulty === null ? 1 : Number(row.empiricalDifficulty)]));
    const byDifficulty = [...poolTags].sort((left, right) => (difficultyById.get(left.mapset_id) ?? 1) - (difficultyById.get(right.mapset_id) ?? 1) || left.mapset_id - right.mapset_id);
    const bandSize = Math.max(DAILY_ROUNDS, Math.ceil(byDifficulty.length * 0.6));
    const middleStart = Math.min(Math.floor(byDifficulty.length * 0.2), byDifficulty.length - bandSize);
    const middlePool = byDifficulty.slice(middleStart, middleStart + bandSize);
    const orderedIds = middlePool.map(({ mapset_id }) => mapset_id);
    const selected = Array.from({ length: DAILY_ROUNDS }, (_, index) => {
        const mapsetId = getDailyItemId(orderedIds, day, gameMode, index + 1);
        return middlePool.find(({ mapset_id }) => mapset_id === mapsetId);
    });
    if (selected.some((entry) => !entry)) throw new NoGameContentError("Could not build today's Daily Challenge");

    const challengeId = crypto.randomUUID();
    const seed = `daily:${currentDate}:${gameMode}`;
    const challengeData = {
        id: challengeId,
        challengeType: "daily",
        gameMode,
        variant: "classic",
        rulesetVersion: CURRENT_RULESET_VERSION,
        ppVersion: CURRENT_PP_VERSION,
        seed,
        configSnapshot,
        roundCount: DAILY_ROUNDS,
        timerMs: 30_000,
        ranked: false,
        dailyDate,
    };

    const selectedMapsets = await Promise.all(selected.map((tags) => getMapsetWithTags(tags!)));
    const roundRows = [];
    for (const [index, mapset] of selectedMapsets.entries()) {
        if (!mapset) throw new NoGameContentError("Daily mapset metadata is unavailable");
        roundRows.push({
            challengeId,
            roundNumber: index + 1,
            itemType: "mapset" as const,
            itemId: mapset.mapset_id,
            answerSnapshot: mapset.title,
            difficultySnapshot: difficultyById.get(mapset.mapset_id) ?? 1,
            contentSnapshot: { artist: mapset.artist, mapper: mapset.mapper },
        });
    }
    try {
        return await prisma.$transaction(async (transaction) => {
            const challenge = await transaction.gameChallenge.create({ data: challengeData });
            await transaction.gameChallengeRound.createMany({ data: roundRows });
            return challenge;
        });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
            const existing = await prisma.gameChallenge.findUnique({
                where: { dailyDate_gameMode_variant: { dailyDate, gameMode, variant: "classic" } },
            });
            if (existing) return existing;
        }
        throw error;
    }
}

async function excludeRecentDailyMapsets(availableTags: MapsetTags[], dailyDate: Date, gameMode: GameMode): Promise<MapsetTags[]> {
    const pastWeekStart = new Date(dailyDate.getTime() - 7 * 86_400_000);
    const otherMapMode = gameMode === GameMode.Audio ? GameMode.Background : GameMode.Audio;
    const recentRows = await query<{ item_id: number }>(
        `SELECT DISTINCT used.item_id FROM (
            SELECT rounds.item_id
            FROM game_challenge_rounds AS rounds
            INNER JOIN game_challenges AS challenges ON challenges.id = rounds.challenge_id
            WHERE challenges.challenge_type = 'daily'
              AND rounds.item_type = 'mapset'
              AND (
                (challenges.game_mode = ? AND challenges.daily_date >= ? AND challenges.daily_date < ?)
                OR (challenges.game_mode = ? AND challenges.daily_date = ?)
              )
            UNION
            SELECT rounds.item_id
            FROM game_rounds AS rounds
            INNER JOIN games ON games.id = rounds.game_id
            WHERE games.run_type = 'daily'
              AND rounds.item_type = 'mapset'
              AND (
                (games.game_mode = ? AND games.ended_at >= ? AND games.ended_at < ?)
                OR (games.game_mode = ? AND games.ended_at >= ? AND games.ended_at < DATE_ADD(?, INTERVAL 1 DAY))
              )
        ) AS used`,
        [gameMode, pastWeekStart, dailyDate, otherMapMode, dailyDate, gameMode, pastWeekStart, dailyDate, otherMapMode, dailyDate, dailyDate],
    );
    const recentIds = new Set(recentRows.map(({ item_id }) => Number(item_id)));
    return availableTags.filter(({ mapset_id }) => !recentIds.has(mapset_id));
}

export async function createManualDailyChallenge(dailyDate: Date, gameMode: GameMode, ignoreRepetitionChecks: boolean, selectedItemIds: number[], overwrite = false): Promise<void> {
    if (gameMode === GameMode.ScorePp) throw new Error("Score pp daily challenges use the score pair pool");
    const itemIds = z.array(z.number().int().positive()).length(DAILY_ROUNDS).parse(selectedItemIds);
    if (new Set(itemIds).size !== DAILY_ROUNDS) throw new Error("Choose a different item for each round");
    if (!overwrite) {
        const existing = await prisma.gameChallenge.findUnique({
            where: { dailyDate_gameMode_variant: { dailyDate, gameMode, variant: "classic" } },
        });
        if (existing) throw new Error(DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED);
    }

    if (gameMode === GameMode.Skin) {
        const skins = await query<SkinData>(`SELECT * FROM skins WHERE id IN (${itemIds.map(() => "?").join(",")}) AND image_filename IS NOT NULL AND image_filename <> ''`, itemIds);
        const skinById = new Map(skins.map((skin) => [skin.id, skin]));
        const selected = itemIds.map((id) => skinById.get(id));
        if (selected.some((skin) => !skin)) throw new Error("One or more selected skins are unavailable");
        await persistDailyChallenge(
            dailyDate,
            gameMode,
            selected.map((skin) => ({
                itemType: "skin" as const,
                itemId: skin!.id,
                answerSnapshot: skin!.name,
                contentSnapshot: { imageFilename: skin!.image_filename },
            })),
            { ignoreRepetitionChecks },
            overwrite,
        );
        return;
    }

    const filenameColumn = gameMode === GameMode.Audio ? "audio_filename" : "image_filename";
    const selectedTags = await query<MapsetTags>(`SELECT * FROM mapset_tags WHERE mapset_id IN (${itemIds.map(() => "?").join(",")}) AND ${filenameColumn} IS NOT NULL AND ${filenameColumn} <> ''`, itemIds);
    const tagsById = new Map(selectedTags.map((tags) => [tags.mapset_id, tags]));
    const orderedTags = itemIds.map((id) => tagsById.get(id));
    if (orderedTags.some((tags) => !tags)) throw new Error("One or more selected mapsets are unavailable for this mode");
    const readyTags = orderedTags as MapsetTags[];
    if (!ignoreRepetitionChecks) {
        const allowed = await excludeRecentDailyMapsets(readyTags, dailyDate, gameMode);
        if (allowed.length !== readyTags.length) throw new Error("A selected mapset violates the daily repetition checks");
    }
    const mapsets = await Promise.all(readyTags.map((tags) => getMapsetWithTags(tags)));
    if (mapsets.some((mapset) => !mapset)) throw new Error("One or more selected mapsets could not be loaded");
    await persistDailyChallenge(
        dailyDate,
        gameMode,
        mapsets.map((mapset) => ({
            itemType: "mapset" as const,
            itemId: mapset!.mapset_id,
            answerSnapshot: mapset!.title,
            contentSnapshot: { artist: mapset!.artist, mapper: mapset!.mapper },
        })),
        { ignoreRepetitionChecks },
        overwrite,
    );
}

async function persistDailyChallenge(
    dailyDate: Date,
    gameMode: GameMode,
    rounds: Array<{ itemType: "mapset" | "skin"; itemId: number; answerSnapshot: string; contentSnapshot: Record<string, unknown> }>,
    configSnapshot: Record<string, unknown>,
    overwrite: boolean,
) {
    const challengeId = crypto.randomUUID();
    await prisma.$transaction(async (transaction) => {
        const uniqueKey = { dailyDate_gameMode_variant: { dailyDate, gameMode, variant: "classic" } };
        const existing = overwrite ? await transaction.gameChallenge.findUnique({ where: uniqueKey, select: { id: true } }) : null;
        if (existing) {
            await transaction.gameChallengeRound.deleteMany({ where: { challengeId: existing.id } });
            await transaction.gameChallenge.delete({ where: { id: existing.id } });
        }
        const challenge = await transaction.gameChallenge.create({
            data: {
                id: challengeId,
                challengeType: "daily",
                gameMode,
                variant: "classic",
                rulesetVersion: CURRENT_RULESET_VERSION,
                ppVersion: CURRENT_PP_VERSION,
                seed: `daily:${dailyDate.toISOString().slice(0, 10)}:${gameMode}`,
                configSnapshot: { ...configSnapshot, manuallySet: true },
                roundCount: DAILY_ROUNDS,
                timerMs: 30_000,
                ranked: false,
                dailyDate,
            },
        });
        await transaction.gameChallengeRound.createMany({
            data: rounds.map((round, index) => ({ challengeId: challenge.id, roundNumber: index + 1, ...round, difficultySnapshot: 1 })),
        });
    });
}

async function getMapsetWithTags(tags: MapsetTags): Promise<MapsetDataWithTags | null> {
    const [storedMapset] = await query<MapsetData>("SELECT * FROM mapset_data WHERE mapset_id = ?", [tags.mapset_id]);
    const mapset = storedMapset ?? (await getMapsetById(tags.mapset_id));
    if (!mapset) return null;

    if (!storedMapset) {
        await query("INSERT INTO mapset_data (mapset_id, title, artist, mapper, ranked_at, star_rating_min, star_rating_max) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            mapset.mapset_id,
            mapset.title,
            mapset.artist,
            mapset.mapper,
            mapset.ranked_at ?? null,
            mapset.star_rating_min ?? null,
            mapset.star_rating_max ?? null,
        ]);
    }

    return { ...tags, ...mapset };
}

async function getMapsetById(mapsetId: number): Promise<MapsetData | null> {
    const response = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${env.OSU_API_KEY}&s=${mapsetId}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const data = (await response.json()) as Array<{
        beatmapset_id: string;
        title: string;
        artist: string;
        creator: string;
        approved_date?: string | null;
        difficultyrating?: string | null;
    }>;
    if (data.length === 0) return null;

    const ratings = data.map((beatmap) => Number(beatmap.difficultyrating)).filter(Number.isFinite);
    return {
        mapset_id: Number(data[0].beatmapset_id),
        title: data[0].title,
        artist: data[0].artist,
        mapper: data[0].creator,
        ranked_at: data[0].approved_date ? new Date(data[0].approved_date) : null,
        star_rating_min: ratings.length > 0 ? Math.min(...ratings) : null,
        star_rating_max: ratings.length > 0 ? Math.max(...ratings) : null,
    };
}

export async function getRandomSkin(sessionId?: string) {
    const skin = await selectRandomSkin(sessionId);
    if (!skin) throw new NoGameContentError("No skin found");
    return { data: skin, skinData: await getMediaData(GameMode.Skin, skin.image_filename) };
}

export async function getDailySkin(day: number, round: number) {
    const dailyDate = new Date(DAILY_EPOCH_UTC + (day - 1) * 86_400_000);
    const challenge = await prisma.gameChallenge.findUnique({ where: { dailyDate_gameMode_variant: { dailyDate, gameMode: GameMode.Skin, variant: "classic" } } });
    if (challenge) {
        const challengeRound = await prisma.gameChallengeRound.findUnique({ where: { challengeId_roundNumber: { challengeId: challenge.id, roundNumber: round } } });
        if (!challengeRound || challengeRound.itemType !== "skin") throw new NoGameContentError("Daily skin challenge is invalid");
        const [skin] = await query<SkinData>(`SELECT * FROM skins WHERE id = ? AND image_filename IS NOT NULL AND image_filename <> ''`, [challengeRound.itemId]);
        if (!skin) throw new NoGameContentError("Daily skin is unavailable");
        return { data: skin, skinData: await getMediaData(GameMode.Skin, skin.image_filename) };
    }
    const skins = await query<SkinData>(`SELECT * FROM skins WHERE image_filename IS NOT NULL AND image_filename <> '' ORDER BY id`);
    const skinId = getDailyItemId(
        skins.map(({ id }) => id),
        day,
        GameMode.Skin,
        round,
    );
    const skin = skins.find(({ id }) => id === skinId);
    if (!skin) throw new NoGameContentError("No daily skin found");
    return { data: skin, skinData: await getMediaData(GameMode.Skin, skin.image_filename) };
}

async function selectRandomSkin(sessionId?: string): Promise<SkinData | null> {
    const excludedIds = await getExcludedIds(sessionId, "skin");
    const excludedCondition = excludedIds.length > 0 ? `AND id NOT IN (${excludedIds.map(() => "?").join(",")})` : "";
    const result = await query(
        `SELECT *
         FROM skins
         WHERE image_filename IS NOT NULL
           AND image_filename <> ''
           ${excludedCondition}
         ORDER BY RAND()
         LIMIT 1`,
        excludedIds,
    );
    return result.length > 0 ? (result[0] as SkinData) : null;
}
