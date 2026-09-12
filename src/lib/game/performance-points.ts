import type { GameVariant } from "@/app/games/config";

const PROFILE_WEIGHT = 0.95;
const PROFILE_PLAY_LIMIT = 100;
const EMPIRICAL_PRIOR_APPEARANCES = 20;
const EMPIRICAL_PRIOR_ACCURACY = 0.65;
const EMPIRICAL_PRIOR_RESPONSE_MS = 10_000;
const DEFAULT_ROUND_TIME_MS = 30_000;

export interface PerformanceRound {
    correct: boolean;
    response_time_ms: number;
    time_limit_ms: number | null;
    difficulty_snapshot: number | null;
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

export function calculateEmpiricalDifficulty(stats?: ContentPerformanceStats): number {
    if (!stats || stats.appearances <= 0) return 1;

    const sampleSize = stats.appearances + EMPIRICAL_PRIOR_APPEARANCES;
    const accuracy = (stats.correct_count + EMPIRICAL_PRIOR_APPEARANCES * EMPIRICAL_PRIOR_ACCURACY) / sampleSize;
    const averageResponseMs = (stats.total_response_time_ms + EMPIRICAL_PRIOR_APPEARANCES * EMPIRICAL_PRIOR_RESPONSE_MS) / sampleSize;
    const responseRatio = clamp(averageResponseMs / DEFAULT_ROUND_TIME_MS, 0, 1);
    const priorResponseRatio = EMPIRICAL_PRIOR_RESPONSE_MS / DEFAULT_ROUND_TIME_MS;

    return roundPp(clamp(1 + 0.8 * (EMPIRICAL_PRIOR_ACCURACY - accuracy) + 0.4 * (responseRatio - priorResponseRatio), 0.75, 1.5));
}

export function calculateRunPp(rounds: PerformanceRound[], variant: GameVariant): number {
    if (rounds.length === 0) return 0;

    const correctRounds = rounds.filter((round) => round.correct);
    if (correctRounds.length === 0) return 0;

    const accuracy = correctRounds.length / rounds.length;
    const accuracyFactor = Math.pow(accuracy, 2.4);

    const responseRatios = correctRounds.map((round) => {
        const timeLimit = Math.max(1, round.time_limit_ms ?? DEFAULT_ROUND_TIME_MS);
        return clamp(round.response_time_ms / timeLimit, 0, 1);
    });
    const speed = responseRatios.reduce((total, ratio) => total + (1 - Math.pow(ratio, 0.65)), 0) / responseRatios.length;
    const speedFactor = 0.75 + speed * 0.5;

    const meanResponseRatio = responseRatios.reduce((total, ratio) => total + ratio, 0) / responseRatios.length;
    const variance = responseRatios.reduce((total, ratio) => total + Math.pow(ratio - meanResponseRatio, 2), 0) / responseRatios.length;
    const consistency = responseRatios.length < 2 ? 0.5 : 1 - clamp(Math.sqrt(variance) / 0.35, 0, 1);
    const consistencyFactor = 0.9 + consistency * 0.1;

    const difficultyFactor =
        correctRounds.reduce((total, round) => total + clamp(round.difficulty_snapshot ?? 1, 0.75, 1.5), 0) / correctRounds.length;

    const lengthBase = variant === "death" || variant === "survival" ? correctRounds.length : rounds.length;
    const lengthFactor = Math.sqrt(lengthBase / 10);

    return roundPp(100 * accuracyFactor * speedFactor * consistencyFactor * difficultyFactor * lengthFactor);
}

export function calculateProfilePp(runPp: number[]): number {
    const weighted = runPp
        .filter((pp) => Number.isFinite(pp) && pp > 0)
        .sort((a, b) => b - a)
        .slice(0, PROFILE_PLAY_LIMIT)
        .reduce((total, pp, index) => total + pp * Math.pow(PROFILE_WEIGHT, index), 0);

    return roundPp(weighted);
}
