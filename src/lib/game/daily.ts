export const DAILY_EPOCH_UTC = Date.UTC(2026, 10, 15); // The day of the first daily challenge
const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_ROUNDS = 5;
export const DAILY_ROUND_TIME = 30;
export const DAILY_CHALLENGE_ALREADY_PLAYED = "DAILY_CHALLENGE_ALREADY_PLAYED";
export const DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED = "DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED";

export type DailyOutcome = "correct" | "incorrect" | "skip" | "timeout";

export function formatDailyShareResult(gameMode: string, day: number, correct: number, totalPoints: number, responseTimeMs: number, outcomes: DailyOutcome[], link: string): string {
    const circles = Array.from({ length: DAILY_ROUNDS }, (_, index) => {
        const outcome = outcomes[index];
        return outcome === "correct" ? "🟢" : outcome === "incorrect" ? "🔴" : outcome === "skip" ? "🟠" : "⬛";
    }).join("");
    const normalizedMode = gameMode.replaceAll("_", " ");
    const seconds = Math.round(responseTimeMs / 1000);
    return `osu!guessr daily ${normalizedMode} #${day}\n${circles}  ${correct}/${DAILY_ROUNDS} · ${totalPoints.toLocaleString("en-US")} pts · ${seconds}s\n${link}`;
}

export function getDailyChallengeDay(now: Date = new Date(), dayOffset = 0): number {
    const utcDate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.floor((utcDate - DAILY_EPOCH_UTC) / DAY_MS) + 1 + dayOffset;
}

export function getDailyDate(now: Date = new Date(), dayOffset = 0): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset));
}

export function parseFutureDailyDate(value: string, now: Date = new Date()): Date {
    if (typeof value !== "string") throw new Error("Enter a date in dd/mm/yyyy format");
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) throw new Error("Enter a date in dd/mm/yyyy format");

    const [, dayText, monthText, yearText] = match;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error("Enter a valid calendar date");
    }
    if (date.getTime() <= getDailyDate(now).getTime()) throw new Error("Choose a future UTC date");
    if (date.getTime() < DAILY_EPOCH_UTC) throw new Error("Choose a date on or after the daily challenge start date");
    return date;
}

export function getNextDailyReset(now: Date = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function seededHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function getDailyItemId(ids: number[], day: number, gameMode: string, round: number): number | undefined {
    if (!Number.isInteger(round) || round < 1 || round > DAILY_ROUNDS || ids.length < DAILY_ROUNDS) return undefined;

    const seed = `${day}:${gameMode}`;
    const orderedIds = [...ids].sort((first, second) => {
        const firstHash = seededHash(`${seed}:${first}`);
        const secondHash = seededHash(`${seed}:${second}`);
        return firstHash - secondHash || first - second;
    });

    return orderedIds[round - 1];
}


export function getDailyStreaks(dates: string[], today: Date = getDailyDate()): { current: number; best: number } {
    const ordered = [...new Set(dates)].sort();
    let current = 0;
    let best = 0;
    let previous = 0;
    for (const date of ordered) {
        const timestamp = Date.parse(`${date}T00:00:00Z`);
        current = timestamp - previous === DAY_MS ? current + 1 : 1;
        best = Math.max(best, current);
        previous = timestamp;
    }
    return { current: previous < today.getTime() - DAY_MS ? 0 : current, best };
}


export function getDailySharePath(gameMode: string, day: number, points: number, responseTimeMs: number, outcomes: DailyOutcome[]): string {
    const rounds = Array.from({ length: DAILY_ROUNDS }, (_, i) => outcomes[i] === "correct" ? "c" : outcomes[i] === "incorrect" ? "i" : outcomes[i] === "skip" ? "s" : "t").join("");
    return `/daily/share?${new URLSearchParams({ mode: gameMode, day: String(day), points: String(points), time: String(responseTimeMs), rounds })}`;
}
