"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Runs an admin server action, tracks pending state and reports the outcome as a toast. */
export function useAdminAction() {
    const { toast } = useToast();
    const [pending, setPending] = useState(false);

    const run = useCallback(
        async <T,>(action: () => Promise<T>, success?: string | ((result: T) => string | undefined)): Promise<T | undefined> => {
            setPending(true);
            try {
                const result = await action();
                const message = typeof success === "function" ? success(result) : success;
                if (message) toast({ title: message });
                return result;
            } catch (error) {
                toast({ variant: "destructive", title: "Action failed", description: errorMessage(error) });
                return undefined;
            } finally {
                setPending(false);
            }
        },
        [toast],
    );

    return { pending, run };
}

interface AdminSectionProps {
    title: string;
    description: string;
    children: React.ReactNode;
}

export function AdminSection({ title, description, children }: AdminSectionProps) {
    return (
        <section>
            <header className="border-b border-border/60 pb-5">
                <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            </header>
            <div className="divide-y divide-border/60">{children}</div>
        </section>
    );
}

interface AdminGroupProps {
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}

export function AdminGroup({ title, description, action, children }: AdminGroupProps) {
    return (
        <div className="py-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-medium">{title}</h3>
                    {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
    return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}

export interface ImportOutcome {
    id: number;
    status: "imported" | "skipped" | "failed";
    detail?: string;
}

const OUTCOME_STYLES: Record<ImportOutcome["status"], { label: string; className: string }> = {
    imported: { label: "Imported", className: "text-success" },
    skipped: { label: "Already imported", className: "text-muted-foreground" },
    failed: { label: "Failed", className: "text-destructive" },
};

export function ImportResults({ results }: { results: ImportOutcome[] }) {
    if (results.length === 0) return null;
    const counts = results.reduce<Record<string, number>>((total, { status }) => ({ ...total, [status]: (total[status] ?? 0) + 1 }), {});

    return (
        <div className="mt-5">
            <p className="text-sm text-muted-foreground">
                {counts.imported ?? 0} imported · {counts.skipped ?? 0} already imported · {counts.failed ?? 0} failed
            </p>
            <ul className="mt-2 max-h-72 divide-y divide-border/60 overflow-y-auto border-y border-border/60 scrollbar-thin">
                {results.map(({ id, status, detail }) => (
                    <li key={id} className="flex items-baseline gap-4 py-2 text-sm">
                        <span className="w-20 shrink-0 font-mono tabular-nums">{id}</span>
                        <span className={`shrink-0 font-medium ${OUTCOME_STYLES[status].className}`}>{OUTCOME_STYLES[status].label}</span>
                        {detail && <span className="min-w-0 truncate text-muted-foreground" title={detail}>{detail}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function FileToTextButton({ onLoad, disabled }: { onLoad: (text: string) => void; disabled?: boolean }) {
    return (
        <label className={`cursor-pointer text-sm text-primary hover:underline ${disabled ? "pointer-events-none opacity-50" : ""}`}>
            Load from .txt file
            <input type="file" accept=".txt,text/plain" className="sr-only" disabled={disabled} onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) onLoad(await file.text());
                event.target.value = "";
            }} />
        </label>
    );
}
