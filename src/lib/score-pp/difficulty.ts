export function getScorePpMaxRelativeGap(round: number): number {
    if (round <= 3) return 0.25;
    if (round <= 6) return 0.18;
    if (round <= 9) return 0.12;
    if (round <= 12) return 0.08;
    if (round <= 15) return 0.06;

    const survivalStep = Math.floor((round - 16) / 5);
    return Math.max(0.02, 0.04 - survivalStep * 0.005);
}

export function getScorePpRelativeGap(leftPp: number, rightPp: number): number {
    const highest = Math.max(leftPp, rightPp);
    if (highest <= 0) return Number.POSITIVE_INFINITY;
    return Math.abs(leftPp - rightPp) / highest;
}
