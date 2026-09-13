import { prisma } from "@/lib/database/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getScorePpMaxRelativeGap, getScorePpRelativeGap } from "./difficulty";
import type { ScorePpPairCandidate, ScorePpPairExclusions } from "./pairing";
import type { ScorePpPairSnapshot, ScorePpScoreSnapshot, ScorePpSide } from "./types";

function toJson(value: ScorePpScoreSnapshot): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canonicalize(pair: ScorePpPairCandidate): ScorePpPairCandidate {
    if (pair.left.sourceScoreId.localeCompare(pair.right.sourceScoreId) <= 0) return pair;
    return { left: pair.right, right: pair.left, relativePpGap: pair.relativePpGap };
}

export async function storeScorePpPair(source: string, candidate: ScorePpPairCandidate): Promise<number> {
    const pair = canonicalize(candidate);
    const higherSide: ScorePpSide = pair.left.pp > pair.right.pp ? "left" : "right";
    const ppGap = Math.abs(pair.left.pp - pair.right.pp);
    const relativePpGap = getScorePpRelativeGap(pair.left.pp, pair.right.pp);
    const stored = await prisma.scorePpPair.upsert({
        where: {
            source_leftScoreId_rightScoreId: {
                source,
                leftScoreId: pair.left.sourceScoreId,
                rightScoreId: pair.right.sourceScoreId,
            },
        },
        create: {
            source,
            leftScoreId: pair.left.sourceScoreId,
            rightScoreId: pair.right.sourceScoreId,
            leftSnapshot: toJson(pair.left),
            rightSnapshot: toJson(pair.right),
            higherSide,
            ppGap,
            relativePpGap,
        },
        update: {
            leftSnapshot: toJson(pair.left),
            rightSnapshot: toJson(pair.right),
            higherSide,
            ppGap,
            relativePpGap,
            active: true,
        },
        select: { id: true },
    });
    return stored.id;
}

type StoredPair = {
    id: number;
    source: string;
    leftSnapshot: unknown;
    rightSnapshot: unknown;
    higherSide: ScorePpSide;
    ppGap: Prisma.Decimal;
    relativePpGap: Prisma.Decimal;
};

const SCORE_PP_PAIR_PAGE_SIZE = 250;
const scorePpPairSelect = {
    id: true,
    source: true,
    leftSnapshot: true,
    rightSnapshot: true,
    higherSide: true,
    ppGap: true,
    relativePpGap: true,
} as const;

function parseSnapshot(value: unknown): ScorePpScoreSnapshot {
    return value as ScorePpScoreSnapshot;
}

export interface ScorePpPairSelectionExclusions extends ScorePpPairExclusions {
    pairIds?: ReadonlySet<number>;
    requeuePairIds?: ReadonlySet<number>;
}

function hasExcludedContent(pair: ScorePpPairSnapshot, exclusions: ScorePpPairSelectionExclusions): boolean {
    if (exclusions.requeuePairIds?.has(pair.id)) return false;

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

function mapStoredPair(row: StoredPair): ScorePpPairSnapshot {
    return {
        id: row.id,
        source: row.source,
        left: parseSnapshot(row.leftSnapshot),
        right: parseSnapshot(row.rightSnapshot),
        higherSide: row.higherSide,
        ppGap: Number(row.ppGap),
    };
}

function flipPair(pair: ScorePpPairSnapshot): ScorePpPairSnapshot {
    return {
        ...pair,
        left: pair.right,
        right: pair.left,
        higherSide: pair.higherSide === "left" ? "right" : "left",
    };
}

export async function selectStoredScorePpPair(
    round: number,
    exclusions: ScorePpPairSelectionExclusions = {},
    rng: () => number = Math.random,
): Promise<ScorePpPairSnapshot | null> {
    const maxGap = getScorePpMaxRelativeGap(round);
    const preferredMinGap = maxGap * 0.35;

    const findCandidates = async (where: { active: true; relativePpGap: { gte?: number; gt?: number; lte: number } }) => {
        for (let skip = 0; ; skip += SCORE_PP_PAIR_PAGE_SIZE) {
            const rows = await prisma.scorePpPair.findMany({
                where,
                skip,
                take: SCORE_PP_PAIR_PAGE_SIZE,
                orderBy: [{ relativePpGap: "desc" }, { id: "asc" }],
                select: scorePpPairSelect,
            });
            const candidates = rows.map(mapStoredPair).filter((pair) => !hasExcludedContent(pair, exclusions));
            if (candidates.length > 0) return candidates;
            if (rows.length < SCORE_PP_PAIR_PAGE_SIZE) return [];
        }
    };

    const preferredCandidates = await findCandidates({ active: true, relativePpGap: { gte: preferredMinGap, lte: maxGap } });
    const candidates = preferredCandidates.length > 0 ? preferredCandidates : await findCandidates({ active: true, relativePpGap: { gt: 0, lte: maxGap } });
    if (candidates.length === 0) return null;

    const selected = candidates[Math.floor(rng() * candidates.length)] ?? null;
    if (!selected) return null;
    return rng() < 0.5 ? selected : flipPair(selected);
}

export async function getStoredScorePpPair(pairId: number): Promise<ScorePpPairSnapshot | null> {
    const row = await prisma.scorePpPair.findFirst({
        where: { id: pairId, active: true },
        select: {
            id: true,
            source: true,
            leftSnapshot: true,
            rightSnapshot: true,
            higherSide: true,
            ppGap: true,
            relativePpGap: true,
        },
    });

    return row ? mapStoredPair(row) : null;
}
