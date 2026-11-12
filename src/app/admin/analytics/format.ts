export type ValueFormat = "count" | "percent" | "ms" | "duration" | "decimal";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export function formatValue(value: number | null | undefined, format: ValueFormat): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "–";

    switch (format) {
        case "count":
            return Math.abs(value) >= 10_000 ? compact.format(value) : whole.format(value);
        case "percent":
            if (value > 0 && value < 0.0001) return "<0.01%";
            return `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 1)}%`;
        case "ms":
            return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
        case "duration": {
            const seconds = Math.round(value);
            return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
        }
        case "decimal":
            return value.toFixed(2);
    }
}

export const MODE_LABELS: Record<string, string> = { background: "Background", audio: "Audio", skin: "Skin", score_pp: "Score PP" };

/** Categorical slots validated against the site's dark surface; each mode keeps its color everywhere. */
export const MODE_COLORS: Record<string, string> = { background: "#3987e5", audio: "#d95926", skin: "#199e70", score_pp: "#c98500" };

/** Round outcomes are states, so they use the reserved status colors, always alongside a label. */
export const OUTCOME_COLORS = { correct: "#0ca30c", wrong: "#d03b3b", skipped: "#898781", timedOut: "#fab219" } as const;

export const END_REASON_COLORS: Record<string, string> = { completed: "#0ca30c", failed: "#ec835a", quit: "#d03b3b", content_exhausted: "#fab219" };

export const NEUTRAL_SERIES = "hsl(var(--primary))";

/** Two more categorical slots (violet, magenta) for non-mode series, validated as a pair on the dark surface. */
export const EXTRA_SERIES = ["#9085e9", "#d55181"] as const;

export function titleCase(value: string): string {
    return value.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());
}
