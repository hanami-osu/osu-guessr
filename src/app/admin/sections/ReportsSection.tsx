"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Report } from "@/actions/types";
import { listReports, updateReportStatus } from "../actions/reports";
import { AdminGroup, AdminSection, EmptyRow, useAdminAction } from "../ui";

const STATUSES = ["pending", "investigating", "resolved", "rejected"] as const;
const OPEN_STATUSES = new Set<string>(["pending", "investigating"]);

function formatLabel(value: string): string {
    return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function ReportsSection() {
    const { pending, run } = useAdminAction();
    const [reports, setReports] = useState<Report[] | null>(null);
    const [showClosed, setShowClosed] = useState(false);

    const load = useCallback(async () => setReports((await run(listReports)) ?? []), [run]);

    useEffect(() => {
        void load();
    }, [load]);

    const setStatus = async (report: Report, status: string) => {
        const result = await run(async () => {
            await updateReportStatus(report.id, status);
            return true;
        }, `Report #${report.id} marked ${status}`);
        if (result) setReports((current) => current?.map((row) => (row.id === report.id ? { ...row, status: status as Report["status"] } : row)) ?? null);
    };

    const openCount = reports?.filter(({ status }) => OPEN_STATUSES.has(status)).length ?? 0;
    const visibleReports = (reports ?? []).filter(({ status }) => showClosed || OPEN_STATUSES.has(status));

    return (
        <AdminSection title="Reports" description="Problems players reported with a mapset during a game.">
            <AdminGroup
                title={showClosed ? "All reports" : `Open reports (${openCount})`}
                action={
                    <Button variant="ghost" size="sm" onClick={() => setShowClosed((value) => !value)}>
                        {showClosed ? "Show open only" : "Show resolved and rejected"}
                    </Button>
                }
            >
                <ul className="divide-y divide-border/60 border-y border-border/60">
                    {reports === null ? (
                        <EmptyRow>Loading reports...</EmptyRow>
                    ) : visibleReports.length === 0 ? (
                        <EmptyRow>{showClosed ? "No reports yet." : "Nothing open. Nice."}</EmptyRow>
                    ) : (
                        visibleReports.map((report) => (
                            <li key={report.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                        <span className="font-medium">{formatLabel(report.report_type)}</span>
                                        <a href={`https://osu.ppy.sh/beatmapsets/${report.mapset_id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                            Mapset {report.mapset_id}
                                        </a>
                                        <Link href={`/user/${report.user_id}`} className="text-muted-foreground hover:text-foreground">
                                            by user {report.user_id}
                                        </Link>
                                        <span className="text-xs text-muted-foreground">
                                            #{report.id} · {new Date(report.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    {report.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{report.description}</p>}
                                </div>
                                <Select value={report.status} onValueChange={(status) => setStatus(report, status)} disabled={pending}>
                                    <SelectTrigger aria-label={`Status of report ${report.id}`} className="h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUSES.map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {formatLabel(status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </li>
                        ))
                    )}
                </ul>
            </AdminGroup>
        </AdminSection>
    );
}
