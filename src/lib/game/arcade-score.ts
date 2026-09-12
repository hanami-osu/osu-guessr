import { BASE_POINTS, ROUND_TIME, SKIP_PENALTY, STREAK_BONUS, TIME_BONUS_MULTIPLIER } from "@/app/games/config";

export function calculateArcadeScore(isCorrect: boolean, timeLeftSeconds: number, streakBefore: number): number {
    const timeLeft = Number(timeLeftSeconds) || 0;
    const streak = Number(streakBefore) || 0;

    if (!isCorrect) return -SKIP_PENALTY;
    return BASE_POINTS + timeLeft * TIME_BONUS_MULTIPLIER + streak * STREAK_BONUS;
}

export function calculateArcadeScoreFromRound(round: {
    correct: boolean;
    responseTimeMs: number;
    timeLimitMs: number | null;
    streakBefore: number;
}): number {
    const timeLimitMs = round.timeLimitMs ?? ROUND_TIME * 1000;
    const responseTimeMs = Math.max(0, Math.min(round.responseTimeMs, timeLimitMs));
    const timeLeftSeconds = Math.max(0, Math.ceil((timeLimitMs - responseTimeMs) / 1000));

    return calculateArcadeScore(round.correct, timeLeftSeconds, round.streakBefore);
}
