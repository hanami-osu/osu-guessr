"use client";

import { useEffect, useRef, useState } from "react";

import { formatValue, type ValueFormat } from "./format";

export interface Series {
    key: string;
    label: string;
    color: string;
}

const AXIS_WIDTH = 44;
const LABEL_HEIGHT = 22;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

function useWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

function niceMax(value: number, format: ValueFormat): number {
    if (format === "percent") return value <= 0 ? 1 : Math.min(1, Math.ceil(value * 10) / 10);
    if (value <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= value) ?? 10;
    return step * magnitude;
}

function topRoundedRect(x: number, y: number, width: number, height: number, radius: number): string {
    const r = Math.min(radius, width / 2, height);
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function Legend({ series }: { series: Series[] }) {
    if (series.length < 2) return null;
    return (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {series.map((item) => (
                <li key={item.key} className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
                    {item.label}
                </li>
            ))}
        </ul>
    );
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: Array<{ label: string; color?: string; value: string }> }) {
    const left = Math.min(Math.max(x, 80), Math.max(80, width - 80));
    return (
        <div className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg" style={{ left }} role="status">
            <p className="mb-1 font-medium text-foreground">{title}</p>
            {rows.map((row) => (
                <p key={row.label} className="flex items-center justify-between gap-4 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        {row.color && <span className="size-2 rounded-sm" style={{ background: row.color }} aria-hidden />}
                        {row.label}
                    </span>
                    <span className="tabular-nums text-foreground">{row.value}</span>
                </p>
            ))}
        </div>
    );
}

function DataTable({ categories, series, values, format, categoryHeader }: { categories: string[]; series: Series[]; values: Array<Array<number | null>>; format: ValueFormat; categoryHeader: string }) {
    return (
        <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
            <div className="mt-2 max-h-64 overflow-auto">
                <table className="w-full tabular-nums">
                    <thead className="text-muted-foreground">
                        <tr>
                            <th className="py-1 pr-3 text-left font-medium">{categoryHeader}</th>
                            {series.map((item) => (
                                <th key={item.key} className="py-1 pr-3 text-right font-medium">
                                    {item.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((category, index) => (
                            <tr key={index} className="border-t border-border/50">
                                <td className="py-1 pr-3">{category}</td>
                                {series.map((item, seriesIndex) => (
                                    <td key={item.key} className="py-1 pr-3 text-right">
                                        {formatValue(values[seriesIndex][index], format)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}

function YAxis({ max, format, plotHeight, width }: { max: number; format: ValueFormat; plotHeight: number; width: number }) {
    return (
        <>
            {[0, 0.5, 1].map((fraction) => {
                const y = plotHeight - fraction * plotHeight;
                return (
                    <g key={fraction}>
                        <line x1={AXIS_WIDTH} x2={width} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={1} />
                        <text x={AXIS_WIDTH - 6} y={y} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                            {formatValue(max * fraction, format)}
                        </text>
                    </g>
                );
            })}
        </>
    );
}

function XLabels({ categories, bandWidth, plotHeight }: { categories: string[]; bandWidth: number; plotHeight: number }) {
    const longest = Math.max(...categories.map((category) => category.length), 1);
    const every = Math.max(1, Math.ceil((longest * 6 + 8) / bandWidth));
    return (
        <>
            {categories.map((category, index) =>
                index % every === 0 ? (
                    <text key={index} x={AXIS_WIDTH + bandWidth * (index + 0.5)} y={plotHeight + 15} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                        {category}
                    </text>
                ) : null,
            )}
        </>
    );
}

interface ColumnChartProps {
    categories: string[];
    series: Series[];
    /** One array per series, aligned with `categories`. Multiple series are stacked. */
    values: number[][];
    format?: ValueFormat;
    height?: number;
    label: string;
    categoryHeader?: string;
}

export function ColumnChart({ categories, series, values, format = "count", height = 200, label, categoryHeader = "Bucket" }: ColumnChartProps) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);

    const plotHeight = height - LABEL_HEIGHT;
    const totals = categories.map((_, index) => values.reduce((sum, row) => sum + (row[index] ?? 0), 0));
    const max = niceMax(Math.max(0, ...totals), format);
    const bandWidth = categories.length > 0 ? Math.max(0, width - AXIS_WIDTH) / categories.length : 0;
    const barWidth = Math.max(1, Math.min(BAR_MAX, bandWidth - (bandWidth > 6 ? Math.max(GAP, bandWidth * 0.3) : 0)));
    const isEmpty = totals.every((total) => total === 0);

    return (
        <figure aria-label={label}>
            <Legend series={series} />
            <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
                {width > 0 && (
                    <svg className="overflow-visible" width={width} height={height} role="img" aria-label={label}>
                        <YAxis max={max} format={format} plotHeight={plotHeight} width={width} />
                        {categories.map((category, index) => {
                            const x = AXIS_WIDTH + bandWidth * index + (bandWidth - barWidth) / 2;
                            let base = plotHeight;
                            const visible = series.map((_, seriesIndex) => seriesIndex).filter((seriesIndex) => values[seriesIndex][index] > 0);
                            return (
                                <g key={index} opacity={hover === null || hover === index ? 1 : 0.55}>
                                    {visible.map((seriesIndex, position) => {
                                        const segmentHeight = (values[seriesIndex][index] / max) * plotHeight;
                                        const isTop = position === visible.length - 1;
                                        const gap = position > 0 && segmentHeight > GAP * 2 ? GAP : 0;
                                        const y = base - segmentHeight;
                                        base = y;
                                        return isTop ? (
                                            <path key={seriesIndex} d={topRoundedRect(x, y, barWidth, segmentHeight - gap, RADIUS)} fill={series[seriesIndex].color} />
                                        ) : (
                                            <rect key={seriesIndex} x={x} y={y} width={barWidth} height={Math.max(0, segmentHeight - gap)} fill={series[seriesIndex].color} />
                                        );
                                    })}
                                    <rect x={AXIS_WIDTH + bandWidth * index} y={0} width={bandWidth} height={plotHeight} fill="transparent" onMouseEnter={() => setHover(index)} />
                                </g>
                            );
                        })}
                        <XLabels categories={categories} bandWidth={bandWidth} plotHeight={plotHeight} />
                    </svg>
                )}
                {isEmpty && width > 0 && <p className="absolute inset-x-0 top-1/3 text-center text-xs text-muted-foreground">No data in this range</p>}
                {hover !== null && (
                    <Tooltip
                        x={AXIS_WIDTH + bandWidth * (hover + 0.5)}
                        width={width}
                        title={categories[hover]}
                        rows={[
                            ...series.map((item, seriesIndex) => ({ label: item.label, color: series.length > 1 ? item.color : undefined, value: formatValue(values[seriesIndex][hover], format) })),
                            ...(series.length > 1 ? [{ label: "Total", value: formatValue(totals[hover], format) }] : []),
                        ]}
                    />
                )}
            </div>
            <DataTable categories={categories} series={series} values={values} format={format} categoryHeader={categoryHeader} />
        </figure>
    );
}

interface LineChartProps {
    categories: string[];
    series: Series[];
    values: Array<Array<number | null>>;
    format?: ValueFormat;
    height?: number;
    label: string;
    categoryHeader?: string;
    /** Extra context per category shown in the tooltip, e.g. sample size. */
    notes?: string[];
}

export function LineChart({ categories, series, values, format = "percent", height = 200, label, categoryHeader = "Bucket", notes }: LineChartProps) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);

    const plotHeight = height - LABEL_HEIGHT;
    const max = niceMax(Math.max(0, ...values.flat().map((value) => value ?? 0)), format);
    const bandWidth = categories.length > 0 ? Math.max(0, width - AXIS_WIDTH) / categories.length : 0;
    const xAt = (index: number) => AXIS_WIDTH + bandWidth * (index + 0.5);
    const yAt = (value: number) => plotHeight - (value / max) * plotHeight;
    const isEmpty = values.every((row) => row.every((value) => value === null));

    return (
        <figure aria-label={label}>
            <Legend series={series} />
            <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
                {width > 0 && (
                    <svg
                        className="overflow-visible"
                        width={width}
                        height={height}
                        role="img"
                        aria-label={label}
                        onMouseMove={(event) => {
                            const x = event.clientX - event.currentTarget.getBoundingClientRect().left - AXIS_WIDTH;
                            setHover(Math.min(categories.length - 1, Math.max(0, Math.floor(x / bandWidth))));
                        }}
                    >
                        <YAxis max={max} format={format} plotHeight={plotHeight} width={width} />
                        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={0} y2={plotHeight} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />}
                        {series.map((item, seriesIndex) => {
                            const path = values[seriesIndex]
                                .map((value, index) => (value === null ? null : `${index === 0 || values[seriesIndex][index - 1] === null ? "M" : "L"}${xAt(index)},${yAt(value)}`))
                                .filter(Boolean)
                                .join("");
                            const lone = values[seriesIndex].map((value, index) =>
                                value !== null && (values[seriesIndex][index - 1] ?? null) === null && (values[seriesIndex][index + 1] ?? null) === null ? index : -1,
                            );
                            return (
                                <g key={item.key}>
                                    <path d={path} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                                    {lone
                                        .filter((index) => index >= 0)
                                        .map((index) => (
                                            <circle key={index} cx={xAt(index)} cy={yAt(values[seriesIndex][index]!)} r={3} fill={item.color} />
                                        ))}
                                    {hover !== null && values[seriesIndex][hover] !== null && (
                                        <circle cx={xAt(hover)} cy={yAt(values[seriesIndex][hover]!)} r={4} fill={item.color} stroke="hsl(var(--background))" strokeWidth={2} />
                                    )}
                                </g>
                            );
                        })}
                        <XLabels categories={categories} bandWidth={bandWidth} plotHeight={plotHeight} />
                    </svg>
                )}
                {isEmpty && width > 0 && <p className="absolute inset-x-0 top-1/3 text-center text-xs text-muted-foreground">No data in this range</p>}
                {hover !== null && (
                    <Tooltip
                        x={xAt(hover)}
                        width={width}
                        title={notes?.[hover] ? `${categories[hover]} · ${notes[hover]}` : categories[hover]}
                        rows={series.map((item, seriesIndex) => ({ label: item.label, color: series.length > 1 ? item.color : undefined, value: formatValue(values[seriesIndex][hover], format) }))}
                    />
                )}
            </div>
            <DataTable categories={categories} series={series} values={values} format={format} categoryHeader={categoryHeader} />
        </figure>
    );
}

const HEAT_STEPS = ["#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

interface HeatmapProps {
    rows: string[];
    columns: string[];
    /** values[row][column] */
    values: number[][];
    label: string;
}

export function Heatmap({ rows, columns, values, label }: HeatmapProps) {
    const [hover, setHover] = useState<{ row: number; column: number } | null>(null);
    const max = Math.max(0, ...values.flat());
    const step = (value: number) => (value <= 0 || max === 0 ? null : HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.floor((value / max) * HEAT_STEPS.length))]);

    return (
        <figure aria-label={label}>
            <div className="grid gap-[2px] text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `2.5rem repeat(${columns.length}, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
                <span />
                {columns.map((column, index) => (
                    <span key={column} className="text-center">
                        {index % 3 === 0 ? column : ""}
                    </span>
                ))}
                {rows.map((row, rowIndex) => (
                    <div key={row} className="contents">
                        <span className="self-center">{row}</span>
                        {columns.map((column, columnIndex) => {
                            const value = values[rowIndex][columnIndex];
                            const color = step(value);
                            return (
                                <span
                                    key={column}
                                    className="aspect-square rounded-[3px] bg-muted"
                                    style={color ? { background: color } : undefined}
                                    title={`${row} ${column}:00 UTC · ${formatValue(value, "count")} games`}
                                    onMouseEnter={() => setHover({ row: rowIndex, column: columnIndex })}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
            <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                    {hover ? `${rows[hover.row]} ${columns[hover.column]}:00 UTC · ${formatValue(values[hover.row][hover.column], "count")} games` : "Hours in UTC. Hover a cell for counts."}
                </span>
                <span className="inline-flex items-center gap-1">
                    Fewer
                    {HEAT_STEPS.map((color) => (
                        <span key={color} className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
                    ))}
                    More
                </span>
            </figcaption>
        </figure>
    );
}

interface SegmentedBarProps {
    parts: Array<{ key: string; label: string; color: string; value: number; darkText?: boolean }>;
    label: string;
}

export function SegmentedBar({ parts, label }: SegmentedBarProps) {
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    if (total === 0) return <p className="text-xs text-muted-foreground">No rounds in this range</p>;

    return (
        <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={`${label}: ${parts.map((part) => `${part.label} ${formatValue(part.value / total, "percent")}`).join(", ")}`}>
            {parts
                .filter((part) => part.value > 0)
                .map((part) => {
                    const share = part.value / total;
                    return (
                        <div
                            key={part.key}
                            className="flex items-center whitespace-nowrap rounded px-1.5 text-[11px] font-medium tabular-nums"
                            style={{ width: `${share * 100}%`, background: part.color, color: part.darkText ? "#0b0b0b" : "#ffffff" }}
                            title={`${part.label}: ${formatValue(part.value, "count")} (${formatValue(share, "percent")})`}
                        >
                            {share >= 0.08 ? formatValue(share, "percent") : null}
                        </div>
                    );
                })}
        </div>
    );
}
