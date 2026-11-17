import { env } from "@/lib/infra/env";
import redisClient from "@/lib/infra/redis";
import { getMediaData } from "@/actions/media";

import { GameMode, type MapsetTags, type MapsetData, type MapsetDataWithTags, type SkinData } from "@/actions/types";
import { NoGameContentError } from "./content-errors";
import { DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED, DAILY_EPOCH_UTC, DAILY_ROUNDS, DAILY_ROUND_TIME, getDailyItemId } from "./daily";
import { prisma } from "@/lib/database/prisma";
import { CURRENT_PP_VERSION, CURRENT_RULESET_VERSION } from "./versioning";
import { acquireRedisLock, releaseRedisLock } from "@/lib/infra/redis-lock-core";
import { z } from "zod";
import { type MapsetTag, Prisma, type Skin } from "@/generated/prisma/client";
import { normalizeString as normalizeSongTitle } from "./guess-checker";

export async function getRandomAudio(sessionId?: string) {
    const audio = await getRandomMapset("audioFilename", sessionId);
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
    const audio = await getDailyMapset("audioFilename", day, GameMode.Audio, round);
    if (!audio) throw new NoGameContentError("No daily audio found");
    return { data: audio, challengeId: audio.challengeId, audioData: await getMediaData(GameMode.Audio, audio.audio_filename) };
}

export async function getRandomBackground(sessionId?: string) {
    const background = await getRandomMapset("imageFilename", sessionId);
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
    const background = await getDailyMapset("imageFilename", day, GameMode.Background, round);
    if (!background) throw new NoGameContentError("No daily background found");
    return { data: background, challengeId: background.challengeId, backgroundData: await getMediaData(GameMode.Background, background.image_filename) };
}

async function getExcludedIds(sessionId: string | undefined, itemType: "mapset" | "skin"): Promise<number[]> {
    if (!sessionId) return [];
    return (await redisClient.sMembers(`session_items:${sessionId}:${itemType}`)).map(Number).filter(Boolean);
}

async function getRandomMapset(filenameColumn: "audioFilename" | "imageFilename", sessionId?: string): Promise<MapsetDataWithTags | null> {
    const excludedIds = await getExcludedIds(sessionId, "mapset");
    const tags = await prisma.$transaction(async (tx) => {
        const filter: Prisma.MapsetTagWhereInput = {
            [filenameColumn]: { not: "" },
            mapsetId: { notIn: excludedIds.length ? excludedIds : [0] },
        };
        const count = await tx.mapsetTag.count({ where: filter });
        if (!count) return null;
        return tx.mapsetTag.findFirst({ where: filter, orderBy: { mapsetId: "asc" }, skip: Math.floor(Math.random() * count) });
    }, { isolationLevel: "RepeatableRead" });
    return tags ? getMapsetWithTags(toMapsetTags(tags)) : null;
}

async function getDailyMapset(filenameColumn: "audioFilename" | "imageFilename", day: number, gameMode: GameMode, round: number): Promise<(MapsetDataWithTags & { challengeId: string }) | null> {
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
    const selectedTags = await prisma.mapsetTag.findUnique({ where: { mapsetId: challengeRound.itemId, [filenameColumn]: { not: "" } } });
    const mapset = selectedTags ? await getMapsetWithTags(toMapsetTags(selectedTags)) : null;
    return mapset ? { ...mapset, title: challengeRound.answerSnapshot, challengeId: challenge.id } : null;
}

async function createDailyMapChallenge(filenameColumn: "audioFilename" | "imageFilename", dailyDate: Date, day: number, gameMode: GameMode, checkRepetition: boolean, manuallySet = false) {
    const availableTags = (await prisma.mapsetTag.findMany({
        where: { [filenameColumn]: { not: "" } },
        orderBy: { mapsetId: "asc" },
    })).map(toMapsetTags);
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
    const challengeData: Prisma.GameChallengeCreateInput = {
        id: challengeId,
        challengeType: "daily",
        gameMode,
        variant: "classic",
        rulesetVersion: CURRENT_RULESET_VERSION,
        ppVersion: CURRENT_PP_VERSION,
        seed,
        configSnapshot,
        roundCount: DAILY_ROUNDS,
        timerMs: DAILY_ROUND_TIME * 1000,
        ranked: false,
        dailyDate,
    };

    const selectedMapsets = await Promise.all(selected.map((tags) => getMapsetWithTags(tags!)));
    const roundRows: Prisma.GameChallengeRoundCreateManyInput[] = [];
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
    if (availableTags.length === 0) return [];
    const pastWeekStart = new Date(dailyDate.getTime() - 7 * 86_400_000);
    const otherMapMode = gameMode === GameMode.Audio ? GameMode.Background : GameMode.Audio;
    const nextDate = new Date(dailyDate.getTime() + 86_400_000);
    const [scheduled, played] = await Promise.all([
        prisma.gameChallengeRound.groupBy({
            by: ["itemId"],
            where: {
                itemType: "mapset",
                challenge: {
                    challengeType: "daily",
                    OR: [{ gameMode, dailyDate: { gte: pastWeekStart, lt: dailyDate } }, { gameMode: otherMapMode, dailyDate }],
                },
            },
        }),
        prisma.gameRound.groupBy({
            by: ["itemId"],
            where: {
                itemType: "mapset",
                game: {
                    runType: "daily",
                    OR: [{ gameMode, endedAt: { gte: pastWeekStart, lt: dailyDate } }, { gameMode: otherMapMode, endedAt: { gte: dailyDate, lt: nextDate } }],
                },
            },
        }),
    ]);
    const recentIds = new Set([...scheduled, ...played].map(({ itemId }) => itemId));
    if (!recentIds.size) return availableTags;
    const recent = await prisma.mapsetData.findMany({ where: { mapsetId: { in: [...recentIds] } }, select: { title: true } });
    const recentTitles = new Set(recent.map(({ title }) => normalizeSongTitle(title ?? "")).filter(Boolean));
    const metadata = recentTitles.size === 0 ? [] : await prisma.mapsetData.findMany({
        where: { mapsetId: { in: availableTags.map(({ mapset_id }) => mapset_id) } },
        select: { mapsetId: true, title: true },
    });
    const titles = new Map(metadata.map(({ mapsetId, title }) => [mapsetId, normalizeSongTitle(title ?? "")]));
    return availableTags.filter(({ mapset_id }) => !recentIds.has(mapset_id) && !recentTitles.has(titles.get(mapset_id) ?? ""));
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
        const skins = (await prisma.skin.findMany({ where: { id: { in: itemIds }, imageFilename: { not: "" } } })).map(toSkinData);
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

    const filenameColumn = gameMode === GameMode.Audio ? "audioFilename" : "imageFilename";
    const selectedTags = (await prisma.mapsetTag.findMany({
        where: { mapsetId: { in: itemIds }, [filenameColumn]: { not: "" } },
    })).map(toMapsetTags);
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
    rounds: Array<{ itemType: "mapset" | "skin"; itemId: number; answerSnapshot: string; contentSnapshot: Prisma.InputJsonObject; difficultySnapshot?: number }>,
    configSnapshot: Prisma.InputJsonObject,
    overwrite: boolean,
) {
    const challengeId = crypto.randomUUID();
    return prisma.$transaction(async (transaction) => {
        const uniqueKey: Prisma.GameChallengeWhereUniqueInput = { dailyDate_gameMode_variant: { dailyDate, gameMode, variant: "classic" } };
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
                configSnapshot: { ...configSnapshot, manuallySet: configSnapshot.manuallySet ?? true },
                roundCount: DAILY_ROUNDS,
                timerMs: DAILY_ROUND_TIME * 1000,
                ranked: false,
                dailyDate,
            },
        });
        await transaction.gameChallengeRound.createMany({
            data: rounds.map((round, index) => ({ difficultySnapshot: 1, ...round, challengeId: challenge.id, roundNumber: index + 1 })),
        });
        return challenge;
    });
}

function toMapsetTags(tag: MapsetTag): MapsetTags {
    return { mapset_id: tag.mapsetId, image_filename: tag.imageFilename ?? "", audio_filename: tag.audioFilename ?? "" };
}

function toSkinData(skin: Skin): SkinData {
    return { id: skin.id, name: skin.name, image_filename: skin.imageFilename, created_at: skin.createdAt, updated_at: skin.updatedAt };
}

async function getMapsetWithTags(tags: MapsetTags): Promise<MapsetDataWithTags | null> {
    let stored = await prisma.mapsetData.findUnique({ where: { mapsetId: tags.mapset_id } });
    if (!stored) {
        const mapset = await getMapsetById(tags.mapset_id);
        if (!mapset) return null;
        await prisma.mapsetData.createMany({
            data: [{
                mapsetId: mapset.mapset_id,
                title: mapset.title,
                artist: mapset.artist,
                mapper: mapset.mapper,
                rankedAt: mapset.ranked_at,
                starRatingMin: mapset.star_rating_min,
                starRatingMax: mapset.star_rating_max,
            }],
            skipDuplicates: true,
        });
        stored = await prisma.mapsetData.findUnique({ where: { mapsetId: mapset.mapset_id } });
        if (!stored) return { ...tags, ...mapset };
    }
    return {
        ...tags,
        mapset_id: stored.mapsetId,
        title: stored.title ?? "",
        artist: stored.artist ?? "",
        mapper: stored.mapper ?? "",
        ranked_at: stored.rankedAt,
        star_rating_min: stored.starRatingMin === null ? null : Number(stored.starRatingMin),
        star_rating_max: stored.starRatingMax === null ? null : Number(stored.starRatingMax),
    };
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
    const key: Prisma.GameChallengeWhereUniqueInput = { dailyDate_gameMode_variant: { dailyDate, gameMode: GameMode.Skin, variant: "classic" } };
    let challenge = await prisma.gameChallenge.findUnique({ where: key });
    if (!challenge) {
        const lock = await acquireRedisLock(`daily_map_pool:${dailyDate.toISOString().slice(0, 10)}`, 60_000);
        if (!lock) throw new Error("Daily skin pool is being initialized; retry shortly");
        try {
            challenge = await prisma.gameChallenge.findUnique({ where: key });
            if (!challenge) {
                const recent = env.DEBUG_DAILY_REUSE_CHECK ? await prisma.gameChallengeRound.groupBy({
                    by: ["itemId"],
                    where: { challenge: { challengeType: "daily", gameMode: GameMode.Skin, dailyDate: { gte: new Date(dailyDate.getTime() - 7 * 86_400_000), lt: dailyDate } } },
                }) : [];
                const skins = (await prisma.skin.findMany({
                    where: { imageFilename: { not: "" }, id: { notIn: recent.map(({ itemId }) => itemId) } },
                    orderBy: { id: "asc" },
                })).map(toSkinData);
                const stats = await prisma.contentStat.findMany({ where: { gameMode: GameMode.Skin, itemType: "skin", rulesetVersion: CURRENT_RULESET_VERSION, ppVersion: CURRENT_PP_VERSION }, select: { itemId: true, empiricalDifficulty: true } });
                const difficulty = new Map(stats.map(stat => [stat.itemId, Number(stat.empiricalDifficulty ?? 1)]));
                skins.sort((a, b) => (difficulty.get(a.id) ?? 1) - (difficulty.get(b.id) ?? 1) || a.id - b.id);
                const size = Math.max(DAILY_ROUNDS, Math.ceil(skins.length * 0.6));
                const start = Math.max(0, Math.min(Math.floor(skins.length * 0.2), skins.length - size));
                const pool = skins.slice(start, start + size);
                const selected = Array.from({ length: DAILY_ROUNDS }, (_, i) => pool.find(skin => skin.id === getDailyItemId(pool.map(skin => skin.id), day, GameMode.Skin, i + 1)));
                if (selected.some(skin => !skin)) throw new NoGameContentError("Not enough unused skins for today's Daily Challenge");
                challenge = await persistDailyChallenge(dailyDate, GameMode.Skin, selected.map(skin => ({ itemType: "skin", itemId: skin!.id, answerSnapshot: skin!.name, contentSnapshot: { imageFilename: skin!.image_filename }, difficultySnapshot: difficulty.get(skin!.id) ?? 1 })), { manuallySet: false }, false);
            }
        } finally { await releaseRedisLock(lock); }
    }
    const challengeRound = await prisma.gameChallengeRound.findUnique({ where: { challengeId_roundNumber: { challengeId: challenge.id, roundNumber: round } } });
    if (!challengeRound || challengeRound.itemType !== "skin") throw new NoGameContentError("Daily skin challenge is invalid");
    const skin = await prisma.skin.findUnique({ where: { id: challengeRound.itemId, imageFilename: { not: "" } } });
    if (!skin) throw new NoGameContentError("Daily skin is unavailable");
    return { data: { ...toSkinData(skin), name: challengeRound.answerSnapshot }, challengeId: challenge.id, skinData: await getMediaData(GameMode.Skin, skin.imageFilename) };
}

async function selectRandomSkin(sessionId?: string): Promise<SkinData | null> {
    const excludedIds = await getExcludedIds(sessionId, "skin");
    const where = { imageFilename: { not: "" }, id: { notIn: excludedIds } };
    const skin = await prisma.$transaction(async (tx) => {
        const count = await tx.skin.count({ where });
        if (!count) return null;
        return tx.skin.findFirst({ where, orderBy: { id: "asc" }, skip: Math.floor(Math.random() * count) });
    }, { isolationLevel: "RepeatableRead" });
    return skin ? toSkinData(skin) : null;
}
