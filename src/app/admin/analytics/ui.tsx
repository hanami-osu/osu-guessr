import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { formatValue, type ValueFormat } from "./format";

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24 border-t border-border/60 pt-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
            <div className="mt-6 grid gap-5 lg:grid-cols-2">{children}</div>
        </section>
    );
}

export function Panel({ title, description, children, wide = false }: { title: string; description?: string; children: React.ReactNode; wide?: boolean }) {
    return (
        <div className={cn("min-w-0 rounded-lg border border-border bg-card/60 p-5", wide && "lg:col-span-2")}>
            <h3 className="font-medium">{title}</h3>
            {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
            <div className="mt-4">{children}</div>
        </div>
    );
}

interface StatTileProps {
    label: string;
    value: number | null;
    format: ValueFormat;
    previous?: number | null;
    /** Whether an increase is an improvement; decides the delta color. */
    upIsGood?: boolean;
}

export function StatTile({ label, value, format, previous, upIsGood = true }: StatTileProps) {
    const change = value !== null && previous !== null && previous !== undefined && previous !== 0 ? (value - previous) / Math.abs(previous) : null;
    const improved = change !== null && change !== 0 && change > 0 === upIsGood;

    return (
        <div className="rounded-lg border border-border bg-card/60 p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{formatValue(value, format)}</p>
            {change !== null && (
                <p className={cn("mt-1 inline-flex items-center gap-1 text-xs tabular-nums", change === 0 ? "text-muted-foreground" : improved ? "text-success" : "text-destructive")}>
                    {change >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                    {`${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% vs previous period`}
                </p>
            )}
        </div>
    );
}

export interface Column<T> {
    header: string;
    cell: (row: T) => React.ReactNode;
    numeric?: boolean;
}

export function DataTable<T>({ columns, rows, empty = "No data in this range" }: { columns: Array<Column<T>>; rows: T[]; empty?: string }) {
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

    return (
        <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                    <tr>
                        {columns.map((column) => (
                            <th key={column.header} className={cn("whitespace-nowrap py-2 pr-4 font-medium last:pr-0", column.numeric ? "text-right" : "text-left")}>
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index} className="border-t border-border/50">
                            {columns.map((column) => (
                                <td key={column.header} className={cn("py-2 pr-4 align-top last:pr-0", column.numeric && "whitespace-nowrap text-right tabular-nums")}>
                                    {column.cell(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function Swatch({ color, label }: { color: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
            {label}
        </span>
    );
}

export function Note({ children }: { children: React.ReactNode }) {
    return <p className="text-sm leading-6 text-muted-foreground">{children}</p>;
}
