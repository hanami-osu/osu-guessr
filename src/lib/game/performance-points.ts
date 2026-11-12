import { SURVIVAL_LIVES, type GameVariant } from "@/app/games/config";

const PROFILE_WEIGHT = 0.95;
const PROFILE_PLAY_LIMIT = 100;
const EMPIRICAL_PRIOR_APPEARANCES = 20;
const EMPIRICAL_PRIOR_ACCURACY = 0.65;
const EMPIRICAL_PRIOR_RESPONSE_MS = 10_000;
const DEFAULT_ROUND_TIME_MS = 30_000;
const DEATH_PP_PER_STREAK = 10;
const CLASSIC_ITEM_WEIGHT_STEEPNESS = 0.6;
const CLASSIC_ITEM_WEIGHT_MIN = 0.25;
const CLASSIC_ITEM_WEIGHT_MAX = 6;
const CLASSIC_MIN_RESPONSE_MS = 500;
const CLASSIC_ACCURACY_EXPONENT = 1.4;

export interface PerformanceRound {
    correct: boolean;
    response_time_ms: number;
    time_limit_ms: number | null;
    difficulty_snapshot: number | null;
    /** Population stats for the round's item, used by classic. */
    item_stats?: ContentPerformanceStats;
}

export interface ContentPerformanceStats {
    appearances: number;
    correct_count: number;
    total_response_time_ms: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function roundPp(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function logit(probability: number): number {
    return Math.log(probability / (1 - probability));
}

function smoothedItemStats(stats?: ContentPerformanceStats): { accuracy: number; averageResponseMs: number } {
    const appearances = stats?.appearances ?? 0;
    const sampleSize = appearances + EMPIRICAL_PRIOR_APPEARANCES;
    return {
        accuracy: ((stats?.correct_count ?? 0) + EMPIRICAL_PRIOR_APPEARANCES * EMPIRICAL_PRIOR_ACCURACY) / sampleSize,
        averageResponseMs: ((stats?.total_response_time_ms ?? 0) + EMPIRICAL_PRIOR_APPEARANCES * EMPIRICAL_PRIOR_RESPONSE_MS) / sampleSize,
    };
}

export function calculateEmpiricalDifficulty(stats?: ContentPerformanceStats): number {
    if (!stats || stats.appearances <= 0) return 1;

    const { accuracy, averageResponseMs } = smoothedItemStats(stats);
    const responseRatio = clamp(averageResponseMs / DEFAULT_ROUND_TIME_MS, 0, 1);
    const priorResponseRatio = EMPIRICAL_PRIOR_RESPONSE_MS / DEFAULT_ROUND_TIME_MS;

    return roundPp(clamp(1 + 0.8 * (EMPIRICAL_PRIOR_ACCURACY - accuracy) + 0.4 * (responseRatio - priorResponseRatio), 0.75, 1.5));
}

/**
 * How much a correct classic answer on this item is worth, on a log-odds scale so items most
 * players miss are worth several times items everyone gets. 1 at the prior accuracy.
 */
function calculateClassicItemWeight(stats?: ContentPerformanceStats): number {
    const { accuracy } = smoothedItemStats(stats);
    return clamp(Math.exp(CLASSIC_ITEM_WEIGHT_STEEPNESS * (logit(EMPIRICAL_PRIOR_ACCURACY) - logit(accuracy))), CLASSIC_ITEM_WEIGHT_MIN, CLASSIC_ITEM_WEIGHT_MAX);
}

/** Speed compared with how long players usually take on this item, 1 when matching the average. */
function calculateClassicSpeedFactor(responseTimeMs: number, stats?: ContentPerformanceStats): number {
    const { averageResponseMs } = smoothedItemStats(stats);
    return clamp(Math.pow(averageResponseMs / Math.max(CLASSIC_MIN_RESPONSE_MS, responseTimeMs), 0.25), 0.75, 1.5);
}

/**
 * Classic has a fixed round count, so the open-ended axis is what you know: each correct round
 * adds its item weight times speed, so hard items answered quickly keep separating strong players.
 */
function calculateClassicRunPp(rounds: PerformanceRound[]): number {
    const correctRounds = rounds.filter((round) => round.correct);
    if (correctRounds.length === 0) return 0;

    const roundValue = correctRounds.reduce((total, round) => total + calculateClassicItemWeight(round.item_stats) * calculateClassicSpeedFactor(round.response_time_ms, round.item_stats), 0);
    const accuracy = correctRounds.length / rounds.length;
    const lengthFactor = Math.sqrt(rounds.length / 10);

    return roundPp(100 * lengthFactor * (roundValue / rounds.length) * Math.pow(accuracy, CLASSIC_ACCURACY_EXPONENT));
}

function calculateSurvivalRunPp(rounds: PerformanceRound[]): number {
    let correctCount = 0;
    let speedSum = 0;
    let responseRatioSum = 0;
    let responseRatioSquaresSum = 0;
    let difficultySum = 0;
    let bestPp = 0;

    for (const round of rounds) {
        if (!round.correct) continue;

        const timeLimit = Math.max(1, round.time_limit_ms ?? DEFAULT_ROUND_TIME_MS);
        const responseRatio = clamp(round.response_time_ms / timeLimit, 0, 1);
        correctCount += 1;
        speedSum += 1 - Math.pow(responseRatio, 0.65);
        responseRatioSum += responseRatio;
        responseRatioSquaresSum += responseRatio * responseRatio;
        difficultySum += clamp(round.difficulty_snapshot ?? 1, 0.75, 1.5);

        const accuracy = correctCount / (correctCount + SURVIVAL_LIVES);
        const speed = speedSum / correctCount;
        const meanResponseRatio = responseRatioSum / correctCount;
        const variance = Math.max(0, responseRatioSquaresSum / correctCount - meanResponseRatio * meanResponseRatio);
        const consistency = correctCount < 2 ? 0.5 : 1 - clamp(Math.sqrt(variance) / 0.35, 0, 1);
        const difficulty = difficultySum / correctCount;
        const lengthFactor = Math.sqrt(correctCount / 10);
        const prefixPp = roundPp(100 * Math.pow(accuracy, 2.4) * (0.75 + speed * 0.5) * (0.9 + consistency * 0.1) * difficulty * lengthFactor);
        bestPp = Math.max(bestPp, prefixPp);
    }

    return bestPp;
}

/**
 * Death ranks by streak first: every correct guess is worth a full step, and speed,
 * consistency and difficulty only add a fraction of a step to separate equal streaks.
 */
function calculateDeathRunPp(rounds: PerformanceRound[]): number {
    const correctRounds = rounds.filter((round) => round.correct);
    if (correctRounds.length === 0) return 0;

    const responseRatios = correctRounds.map((round) => clamp(round.response_time_ms / Math.max(1, round.time_limit_ms ?? DEFAULT_ROUND_TIME_MS), 0, 1));
    const speed = responseRatios.reduce((total, ratio) => total + (1 - Math.pow(ratio, 0.65)), 0) / responseRatios.length;
    const meanResponseRatio = responseRatios.reduce((total, ratio) => total + ratio, 0) / responseRatios.length;
    const variance = responseRatios.reduce((total, ratio) => total + Math.pow(ratio - meanResponseRatio, 2), 0) / responseRatios.length;
    const consistency = responseRatios.length < 2 ? 0.5 : 1 - clamp(Math.sqrt(variance) / 0.35, 0, 1);
    const difficulty = correctRounds.reduce((total, round) => total + clamp(round.difficulty_snapshot ?? 1, 0.75, 1.5), 0) / correctRounds.length;
    const quality = 0.6 * speed + 0.1 * consistency + 0.3 * ((difficulty - 0.75) / 0.75);

    return roundPp(DEATH_PP_PER_STREAK * (correctRounds.length + Math.min(quality, 0.999)));
}

export function calculateRunPp(rounds: PerformanceRound[], variant: GameVariant): number {
    if (rounds.length === 0) return 0;
    if (variant === "survival") return calculateSurvivalRunPp(rounds);
    if (variant === "death") return calculateDeathRunPp(rounds);

    return calculateClassicRunPp(rounds);
}

export function calculateProfilePp(runPp: number[], variant: GameVariant = "classic"): number {
    const ranked = runPp.filter((pp) => Number.isFinite(pp) && pp > 0).sort((a, b) => b - a);
    // Death is about the single best streak, so repeating shorter runs must not add up past a longer one.
    if (variant === "death") return roundPp(ranked[0] ?? 0);

    const weighted = ranked.slice(0, PROFILE_PLAY_LIMIT).reduce((total, pp, index) => total + pp * Math.pow(PROFILE_WEIGHT, index), 0);

    return roundPp(weighted);
}
