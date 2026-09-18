import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import { getScorePpMaxRelativeGap, getScorePpRelativeGap } from "./difficulty";
import type { ScorePpPairCandidate, ScorePpPairExclusions, ScorePpPairSnapshot, ScorePpScoreSnapshot } from "./types";

const RANDOM_WINDOW_SIZE = 120;
const RANDOM_WINDOW_ATTEMPTS = 6;

function toJson(value: ScorePpScoreSnapshot): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canonicalize(pair: ScorePpPairCandidate): ScorePpPairCandidate {
    if (pair.left.sourceScoreId.localeCompare(pair.right.sourceScoreId) <= 0) return pair;
    return { left: pair.right, right: pair.left, relativePpGap: pair.relativePpGap };
}

export async function storeScorePpPair(batchId: string, source: string, candidate: ScorePpPairCandidate): Promise<boolean> {
    const pair = canonicalize(candidate);
    const result = await prisma.scorePpPair.createMany({
        data: [
            {
                batchId,
                source,
                leftScoreId: pair.left.sourceScoreId,
                rightScoreId: pair.right.sourceScoreId,
                leftSnapshot: toJson(pair.left),
                rightSnapshot: toJson(pair.right),
                higherSide: pair.left.pp > pair.right.pp ? "left" : "right",
                ppGap: Math.abs(pair.left.pp - pair.right.pp),
                relativePpGap: getScorePpRelativeGap(pair.left.pp, pair.right.pp),
                active: true,
            },
        ],
        skipDuplicates: true,
    });
    return result.count === 1;
}

type StoredPair = {
    id: number;
    batchId: string;
    leftSnapshot: unknown;
    rightSnapshot: unknown;
    ppGap: Prisma.Decimal;
};

const scorePpPairSelect = {
    id: true,
    batchId: true,
    leftSnapshot: true,
    rightSnapshot: true,
    ppGap: true,
} as const;

function mapStoredPair(row: StoredPair): ScorePpPairSnapshot {
    return {
        id: row.id,
        batchId: row.batchId,
        left: row.leftSnapshot as ScorePpScoreSnapshot,
        right: row.rightSnapshot as ScorePpScoreSnapshot,
        ppGap: Number(row.ppGap),
    };
}

function flipPair(pair: ScorePpPairSnapshot): ScorePpPairSnapshot {
    return { ...pair, left: pair.right, right: pair.left };
}

export interface ScorePpPairSelectionExclusions extends ScorePpPairExclusions {
    pairIds?: ReadonlySet<number>;
}

function hasExcludedContent(pair: ScorePpPairSnapshot, exclusions: ScorePpPairSelectionExclusions): boolean {
    return Boolean(
        exclusions.pairIds?.has(pair.id) ||
            exclusions.scoreIds?.has(pair.left.sourceScoreId) ||
            exclusions.scoreIds?.has(pair.right.sourceScoreId) ||
            exclusions.userIds?.has(pair.left.player.userId) ||
            exclusions.userIds?.has(pair.right.player.userId) ||
            exclusions.beatmapIds?.has(pair.left.beatmap.beatmapId) ||
            exclusions.beatmapIds?.has(pair.right.beatmap.beatmapId),
    );
}

async function getActiveScorePpBatchId(): Promise<string | null> {
    const batch = await prisma.scorePpBatch.findFirst({
        where: { status: "active" },
        orderBy: { activatedAt: "desc" },
        select: { id: true },
    });
    return batch?.id ?? null;
}

async function findCandidates(
    batchId: string,
    relativePpGap: { gte?: number; gt?: number; lte: number },
    exclusions: ScorePpPairSelectionExclusions,
    rng: () => number,
): Promise<ScorePpPairSnapshot[]> {
    const where = { batchId, active: true, relativePpGap } satisfies Prisma.ScorePpPairWhereInput;
    const count = await prisma.scorePpPair.count({ where });
    if (count === 0) return [];

    const loadCandidates = async (skip: number): Promise<ScorePpPairSnapshot[]> => {
        const rows = await prisma.scorePpPair.findMany({
            where,
            orderBy: { id: "asc" },
            skip,
            take: RANDOM_WINDOW_SIZE,
            select: scorePpPairSelect,
        });
        return rows.map(mapStoredPair).filter((pair) => !hasExcludedContent(pair, exclusions));
    };

    for (let attempt = 0; attempt < RANDOM_WINDOW_ATTEMPTS; attempt += 1) {
        const maxSkip = Math.max(0, count - RANDOM_WINDOW_SIZE);
        const skip = Math.floor(rng() * (maxSkip + 1));
        const candidates = await loadCandidates(skip);
        if (candidates.length > 0) return candidates;
    }

    for (let skip = 0; skip < count; skip += RANDOM_WINDOW_SIZE) {
        const candidates = await loadCandidates(skip);
        if (candidates.length > 0) return candidates;
    }

    return [];
}

export async function selectStoredScorePpPair(
    round: number,
    exclusions: ScorePpPairSelectionExclusions = {},
    requestedBatchId?: string | null,
    rng: () => number = Math.random,
): Promise<ScorePpPairSnapshot | null> {
    const batchId = requestedBatchId ?? (await getActiveScorePpBatchId());
    if (!batchId) return null;

    const maxGap = getScorePpMaxRelativeGap(round);
    const preferred = await findCandidates(batchId, { gte: maxGap * 0.35, lte: maxGap }, exclusions, rng);
    const candidates = preferred.length > 0 ? preferred : await findCandidates(batchId, { gt: 0, lte: maxGap }, exclusions, rng);
    const selected = candidates[Math.floor(rng() * candidates.length)] ?? null;
    return selected && rng() < 0.5 ? flipPair(selected) : selected;
}
