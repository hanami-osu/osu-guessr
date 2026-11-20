export const ANALYTICS_RANGES = {
    "7d": { label: "7 days", days: 7 },
    "30d": { label: "30 days", days: 30 },
    "90d": { label: "90 days", days: 90 },
    "365d": { label: "1 year", days: 365 },
    all: { label: "All time", days: null },
} as const;

export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;
/** Inclusive UTC days as YYYY-MM-DD. */
export interface CustomRange {
    from: string;
    to: string;
}
export type AnalyticsSelection = AnalyticsRange | CustomRange;
export type BucketSize = "day" | "week";

const DAY_MS = 86_400_000;
const WEEKLY_AFTER_MS = 120 * DAY_MS;

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
    return typeof value === "string" && Object.hasOwn(ANALYTICS_RANGES, value) ? (value as AnalyticsRange) : "30d";
}

function parseDay(value: unknown): Date | null {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    // Rejects dates that roll over, such as 2026-02-31.
    return Number.isNaN(date.getTime()) || toDateKey(date) !== value ? null : date;
}

/** A valid from/to pair wins; anything else falls back to the preset range. */
export function parseAnalyticsSelection(params: { range?: string | string[]; from?: string | string[]; to?: string | string[] }): AnalyticsSelection {
    const from = parseDay(params.from);
    const to = parseDay(params.to);
    if (from && to && from <= to) return { from: toDateKey(from), to: toDateKey(to) };
    return parseAnalyticsRange(params.range);
}

export interface ResolvedRange {
    range: AnalyticsRange | "custom";
    since: Date;
    /** Exclusive end of the period. */
    until: Date;
    /** Start of the equally long period before `since`, or null when there is nothing to compare against. */
    previousSince: Date | null;
    bucket: BucketSize;
}

export function resolveRange(selection: AnalyticsSelection, now: Date, earliest: Date | null): ResolvedRange {
    // Presets run up to now; a day of slack keeps games stamped a moment ahead of this clock.
    const openEnd = new Date(now.getTime() + DAY_MS);
    if (typeof selection === "object") {
        const since = parseDay(selection.from) ?? now;
        const until = new Date(Math.max(since.getTime(), Math.min((parseDay(selection.to) ?? now).getTime() + DAY_MS, openEnd.getTime())));
        const length = until.getTime() - since.getTime();
        return { range: "custom", since, until, previousSince: new Date(since.getTime() - length), bucket: length > WEEKLY_AFTER_MS ? "week" : "day" };
    }

    const { days } = ANALYTICS_RANGES[selection];
    if (days === null) {
        const since = earliest ?? now;
        return { range: selection, since, until: openEnd, previousSince: null, bucket: now.getTime() - since.getTime() > WEEKLY_AFTER_MS ? "week" : "day" };
    }

    const since = new Date(now.getTime() - days * DAY_MS);
    return { range: selection, since, until: openEnd, previousSince: new Date(since.getTime() - days * DAY_MS), bucket: days * DAY_MS > WEEKLY_AFTER_MS ? "week" : "day" };
}

export function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Start of the UTC day or ISO week (Monday) containing `date`, as YYYY-MM-DD. */
export function bucketKey(date: Date, bucket: BucketSize): string {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (bucket === "week") day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return toDateKey(day);
}

export function listBuckets(since: Date, until: Date, bucket: BucketSize): string[] {
    const keys: string[] = [];
    const cursor = new Date(`${bucketKey(since, bucket)}T00:00:00Z`);
    const step = bucket === "week" ? 7 : 1;
    while (cursor.getTime() <= until.getTime()) {
        keys.push(toDateKey(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + step);
    }
    return keys;
}
