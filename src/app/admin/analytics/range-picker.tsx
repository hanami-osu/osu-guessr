"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/analytics/range";

interface RangePickerProps {
    active: AnalyticsRange | "custom";
    /** Days shown in the custom inputs, YYYY-MM-DD. */
    from: string;
    to: string;
    today: string;
}

/** Recomputing analytics takes a moment, so the clicked option shows a spinner until the new numbers arrive. */
export default function RangePicker({ active, from, to, today }: RangePickerProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [target, setTarget] = useState<string | null>(null);
    const [start, setStart] = useState(from);
    const [end, setEnd] = useState(to);

    function open(key: string, query: Record<string, string>) {
        setTarget(key);
        startTransition(() => router.push(`/admin/analytics?${new URLSearchParams(query)}`));
    }

    const spinner = (key: string) => pending && target === key && <Loader2 aria-hidden="true" className="animate-spin" />;

    return (
        <div className="flex flex-col gap-3 lg:items-end" aria-busy={pending}>
            <nav aria-label="Time range" className="flex flex-wrap gap-2">
                {(Object.keys(ANALYTICS_RANGES) as AnalyticsRange[]).map((key) => (
                    <Button
                        key={key}
                        size="sm"
                        variant={key === active ? "default" : "outline"}
                        aria-current={key === active ? "page" : undefined}
                        disabled={pending}
                        onClick={() => open(key, { range: key })}
                    >
                        {spinner(key)}
                        {ANALYTICS_RANGES[key].label}
                    </Button>
                ))}
            </nav>
            <form
                className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                onSubmit={(event) => {
                    event.preventDefault();
                    open("custom", { from: start, to: end });
                }}
            >
                <Input type="date" aria-label="From" className="h-8 w-auto" value={start} max={end || today} required onChange={(event) => setStart(event.target.value)} />
                <span>to</span>
                <Input type="date" aria-label="To" className="h-8 w-auto" value={end} min={start} max={today} required onChange={(event) => setEnd(event.target.value)} />
                <Button type="submit" size="sm" variant={active === "custom" ? "default" : "outline"} disabled={pending || !start || !end || start > end}>
                    {spinner("custom")}
                    Apply
                </Button>
            </form>
        </div>
    );
}
