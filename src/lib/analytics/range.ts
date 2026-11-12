export const ANALYTICS_RANGES = {
    "7d": { label: "7 days", days: 7 },
    "30d": { label: "30 days", days: 30 },
    "90d": { label: "90 days", days: 90 },
    "365d": { label: "1 year", days: 365 },
    all: { label: "All time", days: null },
} as const;

export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;
export type BucketSize = "day" | "week";

const DAY_MS = 86_400_000;

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
    return typeof value === "string" && value in ANALYTICS_RANGES ? (value as AnalyticsRange) : "30d";
}

export interface ResolvedRange {
    range: AnalyticsRange;
    since: Date;
    /** Start of the equally long period before `since`, or null when there is nothing to compare against. */
    previousSince: Date | null;
    bucket: BucketSize;
}

export function resolveRange(range: AnalyticsRange, now: Date, earliest: Date | null): ResolvedRange {
    const { days } = ANALYTICS_RANGES[range];
    if (days === null) {
        const since = earliest ?? now;
        return { range, since, previousSince: null, bucket: now.getTime() - since.getTime() > 120 * DAY_MS ? "week" : "day" };
    }

    const since = new Date(now.getTime() - days * DAY_MS);
    return { range, since, previousSince: new Date(since.getTime() - days * DAY_MS), bucket: days > 120 ? "week" : "day" };
}

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Start of the UTC day or ISO week (Monday) containing `date`, as YYYY-MM-DD. Matches the SQL bucket expression. */
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
