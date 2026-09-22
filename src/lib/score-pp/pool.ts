import { prisma } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import type { RedisLock } from "@/lib/redis-lock";
import { getScorePpMaxRelativeGap, getScorePpRelativeGap } from "./difficulty";
import { OsuApiScoreSource } from "./osu-api-source";
import { storeScorePpPair } from "./store";
import type { ScorePpPairCandidate, ScorePpScoreSnapshot } from "./types";
import { acquireRedisLock, releaseRedisLock } from "@/lib/redis-lock";
import { shuffle } from "./random";

export const SCORE_PP_PAIR_TARGET = 10_000;
export const SCORE_PP_ROTATION_MS = 24 * 60 * 60 * 1000;
export const SCORE_PP_SAMPLE_PLAYER_COUNT = 1_000;
export const SCORE_PP_SCORES_PER_PLAYER = 10;
export const SCORE_PP_SAMPLE_TOP_SCORE_LIMIT = 100;
const SCORE_PP_SAMPLE_PLAYER_CANDIDATES = 1_100;
const SCORE_PP_BUILD_AHEAD_MS = 4 * 60 * 60 * 1000;
const SCORE_PP_BOOTSTRAP_PAIR_COUNT = 100;
const SCORE_PP_RETAIN_MS = 48 * 60 * 60 * 1000;
const SCORE_PP_BUILD_LOCK_MS = 6 * 60 * 60 * 1000;
const SCORE_PP_BUILD_STALE_MS = 12 * 60 * 60 * 1000;
const SCORE_PP_SCORE_FETCH_CONCURRENCY = 10;
const SCORE_PP_POOL_LOCK_KEY = "score_pp_pair_pool_build_lock";
const GENERATION_ROUNDS = [1, 4, 7, 10, 13, 16, 21, 26, 31, 41] as const;

export interface ScorePpPoolRefreshResult {
    refreshed: boolean;
    batchId: string | null;
    pairCount: number;
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, mapper: (value: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(values[index], index);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
    return results;
}

async function sampleDailyScores(source: OsuApiScoreSource): Promise<ScorePpScoreSnapshot[]> {
    const userIds = await source.getRandomCandidateUserIds(SCORE_PP_SAMPLE_PLAYER_CANDIDATES);
    if (userIds.length < SCORE_PP_SAMPLE_PLAYER_COUNT) {
        throw new Error(`Only ${userIds.length} top-10k players were available for the Score PP daily pool`);
    }

    const sampledByPlayer = await mapConcurrent(userIds, SCORE_PP_SCORE_FETCH_CONCURRENCY, async (userId) => {
        const player = await source.getPlayer(userId);
        if (!player) return [];

        const scores = await source.getTopScores(userId, SCORE_PP_SAMPLE_TOP_SCORE_LIMIT);
        if (scores.length < SCORE_PP_SCORES_PER_PLAYER) return [];

        const sampled = shuffle(scores).slice(0, SCORE_PP_SCORES_PER_PLAYER);
        const enriched = await Promise.all(sampled.map((score) => source.enrichScore(score, player)));
        return enriched.filter((score): score is ScorePpScoreSnapshot => score !== null);
    });

    const completePlayers = sampledByPlayer.filter((scores) => scores.length === SCORE_PP_SCORES_PER_PLAYER).slice(0, SCORE_PP_SAMPLE_PLAYER_COUNT);
    if (completePlayers.length < SCORE_PP_SAMPLE_PLAYER_COUNT) {
        throw new Error(`Only ${completePlayers.length} sampled players had ${SCORE_PP_SCORES_PER_PLAYER} eligible top-100 plays`);
    }

    return completePlayers.flat();
}

function lowerBound(scores: readonly ScorePpScoreSnapshot[], pp: number): number {
    let low = 0;
    let high = scores.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (scores[middle].pp < pp) low = middle + 1;
        else high = middle;
    }
    return low;
}

function upperBound(scores: readonly ScorePpScoreSnapshot[], pp: number): number {
    let low = 0;
    let high = scores.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (scores[middle].pp <= pp) low = middle + 1;
        else high = middle;
    }
    return low;
}

function pairKey(leftScoreId: string, rightScoreId: string): string {
    return leftScoreId.localeCompare(rightScoreId) <= 0 ? `${leftScoreId}:${rightScoreId}` : `${rightScoreId}:${leftScoreId}`;
}

function pickPairFromSample(sortedScores: readonly ScorePpScoreSnapshot[], round: number, usedPairKeys: ReadonlySet<string>): ScorePpPairCandidate | null {
    const maxGap = getScorePpMaxRelativeGap(round);

    for (let anchorAttempt = 0; anchorAttempt < 64; anchorAttempt += 1) {
        const anchor = sortedScores[Math.floor(Math.random() * sortedScores.length)];
        if (!anchor) return null;

        const minimumPp = anchor.pp * (1 - maxGap);
        const maximumPp = anchor.pp / (1 - maxGap);
        const start = lowerBound(sortedScores, minimumPp);
        const end = upperBound(sortedScores, maximumPp);
        if (end - start < 2) continue;

        for (let opponentAttempt = 0; opponentAttempt < 64; opponentAttempt += 1) {
            const opponent = sortedScores[start + Math.floor(Math.random() * (end - start))];
            if (
                !opponent ||
                opponent.sourceScoreId === anchor.sourceScoreId ||
                opponent.player.userId === anchor.player.userId ||
                opponent.beatmap.beatmapId === anchor.beatmap.beatmapId ||
                Math.abs(anchor.pp - opponent.pp) < 0.01 ||
                usedPairKeys.has(pairKey(anchor.sourceScoreId, opponent.sourceScoreId))
            ) {
                continue;
            }

            const relativePpGap = getScorePpRelativeGap(anchor.pp, opponent.pp);
            if (relativePpGap > maxGap) continue;
            return { left: anchor, right: opponent, relativePpGap };
        }
    }

    return null;
}

async function acquireBuildLock(): Promise<RedisLock | null> {
    return acquireRedisLock(SCORE_PP_POOL_LOCK_KEY, SCORE_PP_BUILD_LOCK_MS);
}

async function releaseBuildLock(lock: RedisLock): Promise<void> {
    await releaseRedisLock(lock);
}

async function getActiveBatch() {
    return prisma.scorePpBatch.findFirst({ where: { status: "active" }, orderBy: { activatedAt: "desc" } });
}

async function getReadyBatch(targetCount: number) {
    return prisma.scorePpBatch.findFirst({
        where: { status: "ready", pairCount: { gte: targetCount }, targetCount: { gte: targetCount } },
        orderBy: { completedAt: "desc" },
    });
}

function batchNeedsBuild(batch: Awaited<ReturnType<typeof getActiveBatch>>, targetCount: number, now: number): boolean {
    if (!batch?.activatedAt) return true;
    if (batch.pairCount < targetCount || batch.targetCount < targetCount) return true;
    return now - batch.activatedAt.getTime() >= SCORE_PP_ROTATION_MS - SCORE_PP_BUILD_AHEAD_MS;
}

async function getOrCreateBuildingBatch(targetCount: number, active: Awaited<ReturnType<typeof getActiveBatch>>) {
    if (active?.activatedAt && active.targetCount === targetCount && active.pairCount < targetCount && Date.now() - active.activatedAt.getTime() < SCORE_PP_ROTATION_MS) {
        return active;
    }

    const staleBefore = new Date(Date.now() - SCORE_PP_BUILD_STALE_MS);
    await prisma.scorePpBatch.updateMany({ where: { status: "building", startedAt: { lt: staleBefore } }, data: { status: "failed", completedAt: new Date() } });

    const existing = await prisma.scorePpBatch.findFirst({ where: { status: "building" }, orderBy: { startedAt: "desc" } });
    if (existing) {
        if (existing.targetCount !== targetCount) {
            return prisma.scorePpBatch.update({ where: { id: existing.id }, data: { targetCount } });
        }
        return existing;
    }

    return prisma.scorePpBatch.create({
        data: {
            id: crypto.randomUUID(),
            status: "building",
            targetCount,
        },
    });
}

async function activateBatch(batchId: string, pairCount: number, targetCount: number, complete: boolean): Promise<void> {
    const current = await prisma.scorePpBatch.findUnique({ where: { id: batchId }, select: { activatedAt: true } });
    const activatedAt = current?.activatedAt ?? new Date();
    await prisma.$transaction([
        prisma.scorePpBatch.updateMany({ where: { status: "active", id: { not: batchId } }, data: { status: "retired" } }),
        prisma.scorePpBatch.update({
            where: { id: batchId },
            data: { status: "active", pairCount, targetCount, activatedAt, completedAt: complete ? new Date() : null },
        }),
    ]);

    const cutoff = new Date(activatedAt.getTime() - SCORE_PP_RETAIN_MS);
    const stale = await prisma.scorePpBatch.findMany({
        where: { status: { in: ["retired", "failed"] }, startedAt: { lt: cutoff } },
        select: { id: true },
    });
    const staleIds = stale.map(({ id }) => id);
    if (staleIds.length > 0) {
        await prisma.$transaction([prisma.scorePpPair.deleteMany({ where: { batchId: { in: staleIds } } }), prisma.scorePpBatch.deleteMany({ where: { id: { in: staleIds } } })]);
    }
}

export async function refreshScorePpPairPool(options: { force?: boolean; targetCount?: number } = {}): Promise<ScorePpPoolRefreshResult> {
    const targetCount = Math.max(1, Math.min(10_000, Math.trunc(options.targetCount ?? SCORE_PP_PAIR_TARGET)));
    const activeBeforeLock = await getActiveBatch();
    const nowBeforeLock = Date.now();
    const readyBeforeLock = await getReadyBatch(targetCount);
    if (!options.force && activeBeforeLock?.activatedAt && nowBeforeLock - activeBeforeLock.activatedAt.getTime() >= SCORE_PP_ROTATION_MS && readyBeforeLock) {
        await activateBatch(readyBeforeLock.id, readyBeforeLock.pairCount, targetCount, true);
        return { refreshed: true, batchId: readyBeforeLock.id, pairCount: readyBeforeLock.pairCount };
    }
    if (!options.force && readyBeforeLock && !batchNeedsBuild(activeBeforeLock, targetCount, nowBeforeLock)) {
        return { refreshed: false, batchId: activeBeforeLock?.id ?? null, pairCount: activeBeforeLock?.pairCount ?? 0 };
    }
    if (!options.force && !batchNeedsBuild(activeBeforeLock, targetCount, nowBeforeLock)) {
        return { refreshed: false, batchId: activeBeforeLock?.id ?? null, pairCount: activeBeforeLock?.pairCount ?? 0 };
    }

    const lock = await acquireBuildLock();
    if (!lock) return { refreshed: false, batchId: activeBeforeLock?.id ?? null, pairCount: activeBeforeLock?.pairCount ?? 0 };

    let source: OsuApiScoreSource | null = null;
    try {
        const active = await getActiveBatch();
        const now = Date.now();
        const ready = await getReadyBatch(targetCount);
        if (!options.force && active?.activatedAt && now - active.activatedAt.getTime() >= SCORE_PP_ROTATION_MS && ready) {
            await activateBatch(ready.id, ready.pairCount, targetCount, true);
            return { refreshed: true, batchId: ready.id, pairCount: ready.pairCount };
        }
        if (!options.force && ready && active?.activatedAt && now - active.activatedAt.getTime() < SCORE_PP_ROTATION_MS) {
            return { refreshed: false, batchId: active.id, pairCount: active.pairCount };
        }
        if (!options.force && !batchNeedsBuild(active, targetCount, now)) {
            return { refreshed: false, batchId: active?.id ?? null, pairCount: active?.pairCount ?? 0 };
        }
        if (!env.OSU_CLIENT_ID || !env.OSU_CLIENT_SECRET) throw new Error("OSU_CLIENT_ID and OSU_CLIENT_SECRET are required to prepare Score PP pairs");

        const batch = await getOrCreateBuildingBatch(targetCount, active);
        const isActiveBatch = batch.id === active?.id;
        let pairCount = await prisma.scorePpPair.count({ where: { batchId: batch.id } });
        source = await OsuApiScoreSource.create(env.OSU_CLIENT_ID, env.OSU_CLIENT_SECRET);
        const sampledScores = (await sampleDailyScores(source)).sort((left, right) => left.pp - right.pp);
        const existingPairs = await prisma.scorePpPair.findMany({ where: { batchId: batch.id }, select: { leftScoreId: true, rightScoreId: true } });
        const usedPairKeys = new Set(existingPairs.map((pair) => pairKey(pair.leftScoreId, pair.rightScoreId)));
        let misses = 0;

        while (pairCount < targetCount && misses < Math.max(250, targetCount * 3)) {
            const round = GENERATION_ROUNDS[pairCount % GENERATION_ROUNDS.length];
            const candidate = pickPairFromSample(sampledScores, round, usedPairKeys);
            if (!candidate) {
                misses += 1;
                continue;
            }

            if (await storeScorePpPair(batch.id, "osu_api", candidate)) {
                pairCount += 1;
                usedPairKeys.add(pairKey(candidate.left.sourceScoreId, candidate.right.sourceScoreId));
                misses = 0;
                if (pairCount % 50 === 0) {
                    await prisma.scorePpBatch.update({ where: { id: batch.id }, data: { pairCount } });
                }
                if (!active && pairCount === Math.min(SCORE_PP_BOOTSTRAP_PAIR_COUNT, targetCount)) {
                    await activateBatch(batch.id, pairCount, targetCount, false);
                }
            } else {
                misses += 1;
            }
        }

        if (pairCount < targetCount) {
            await prisma.scorePpBatch.update({ where: { id: batch.id }, data: { status: "failed", pairCount, completedAt: new Date() } });
            throw new Error(`Only ${pairCount} unique Score PP pairs could be prepared`);
        }

        const latestActive = await getActiveBatch();
        const shouldActivate =
            options.force ||
            isActiveBatch ||
            latestActive?.id === batch.id ||
            !latestActive?.activatedAt ||
            latestActive.pairCount < targetCount ||
            latestActive.targetCount < targetCount ||
            Date.now() - latestActive.activatedAt.getTime() >= SCORE_PP_ROTATION_MS;
        if (shouldActivate) {
            await activateBatch(batch.id, pairCount, targetCount, true);
            return { refreshed: true, batchId: batch.id, pairCount };
        }

        await prisma.scorePpBatch.update({
            where: { id: batch.id },
            data: { status: "ready", pairCount, targetCount, completedAt: new Date() },
        });
        return { refreshed: false, batchId: latestActive.id, pairCount: latestActive.pairCount };
    } finally {
        await source?.close();
        await releaseBuildLock(lock);
    }
}

let maintainerStarted = false;

export function startScorePpPairPoolMaintainer(): void {
    if (maintainerStarted) return;
    maintainerStarted = true;

    const maintain = () => {
        void refreshScorePpPairPool().catch((error) => {
            console.error("Score PP pair-pool refresh failed:", error instanceof Error ? error.message : error);
        });
    };

    const initial = setTimeout(maintain, 1_000);
    initial.unref();
    const timer = setInterval(maintain, 15 * 60 * 1000);
    timer.unref();
}
