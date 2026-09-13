import { SCORE_PP_MAX_GLOBAL_RANK, SCORE_PP_TOP_SCORE_LIMIT, getScorePpMaxRelativeGap, getScorePpRelativeGap } from "./difficulty";
import type { ScorePpPlayerSnapshot, ScorePpScoreSnapshot } from "./types";
import type { ScorePpMetadataSource, ScorePpScoreSource, ScorePpSourceScore } from "./source";

export interface ScorePpPairCandidate {
    left: ScorePpScoreSnapshot;
    right: ScorePpScoreSnapshot;
    relativePpGap: number;
}

export interface ScorePpPairExclusions {
    scoreIds?: ReadonlySet<string>;
    userIds?: ReadonlySet<number>;
    beatmapIds?: ReadonlySet<number>;
}

export interface ScorePpPairGeneratorOptions {
    playerPoolSize?: number;
    rng?: () => number;
    exclusions?: ScorePpPairExclusions;
}

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(rng() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function isSourceScoreExcluded(score: ScorePpSourceScore, exclusions: ScorePpPairExclusions): boolean {
    return Boolean(exclusions.scoreIds?.has(score.sourceScoreId) || exclusions.userIds?.has(score.userId) || exclusions.beatmapIds?.has(score.beatmapId));
}

function pickRandom<T>(values: readonly T[], rng: () => number): T | null {
    if (values.length === 0) return null;
    return values[Math.floor(rng() * values.length)] ?? null;
}

async function getEligiblePlayers(userIds: number[], metadata: ScorePpMetadataSource): Promise<ScorePpPlayerSnapshot[]> {
    const players = await Promise.all(userIds.map((userId) => metadata.getPlayer(userId)));
    return players.filter((player): player is ScorePpPlayerSnapshot => Boolean(player?.globalRank && player.globalRank <= SCORE_PP_MAX_GLOBAL_RANK));
}

export async function generateScorePpPair(
    source: ScorePpScoreSource,
    metadata: ScorePpMetadataSource,
    round: number,
    options: ScorePpPairGeneratorOptions = {},
): Promise<ScorePpPairCandidate | null> {
    const rng = options.rng ?? Math.random;
    const exclusions = options.exclusions ?? {};
    const playerPoolSize = Math.max(4, Math.min(100, options.playerPoolSize ?? 24));
    const userIds = await source.getRandomCandidateUserIds(playerPoolSize);
    const eligiblePlayers = shuffle(
        (await getEligiblePlayers(userIds, metadata)).filter((player) => !exclusions.userIds?.has(player.userId)),
        rng,
    );
    const maxGap = getScorePpMaxRelativeGap(round);

    for (const anchorPlayer of eligiblePlayers) {
        const anchorScores = (await source.getTopScores(anchorPlayer.userId, SCORE_PP_TOP_SCORE_LIMIT)).filter((score) => !isSourceScoreExcluded(score, exclusions));
        const anchor = pickRandom(anchorScores, rng);
        if (!anchor) continue;

        for (const opponentPlayer of shuffle(
            eligiblePlayers.filter((player) => player.userId !== anchorPlayer.userId),
            rng,
        )) {
            const opponentScores = (await source.getTopScores(opponentPlayer.userId, SCORE_PP_TOP_SCORE_LIMIT)).filter(
                (score) =>
                    !isSourceScoreExcluded(score, exclusions) &&
                    score.beatmapId !== anchor.beatmapId &&
                    getScorePpRelativeGap(anchor.pp, score.pp) <= maxGap &&
                    Math.abs(anchor.pp - score.pp) >= 0.01,
            );
            const opponent = pickRandom(opponentScores, rng);
            if (!opponent) continue;

            const [left, right] = await Promise.all([metadata.enrichScore(anchor, anchorPlayer), metadata.enrichScore(opponent, opponentPlayer)]);
            if (!left || !right) continue;

            return {
                left,
                right,
                relativePpGap: getScorePpRelativeGap(left.pp, right.pp),
            };
        }
    }

    return null;
}
