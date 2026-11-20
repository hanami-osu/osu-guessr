"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkTranslation, fillMissingTranslations, getAllLanguages, removeExtraTranslations } from "../actions/check-translations";
import { AdminGroup, AdminSection, EmptyRow, useAdminAction } from "../ui";

interface LanguageReport {
    language: string;
    totalKeys: number;
    missingKeys: string[];
    extraKeys: string[];
}

async function checkLanguage(language: string): Promise<LanguageReport> {
    const result = await checkTranslation(language);
    if (!result.success) throw new Error(`${language}: ${result.error}`);
    return { language, totalKeys: result.totalKeys ?? 0, missingKeys: result.missingKeys ?? [], extraKeys: result.extraKeys ?? [] };
}

function KeyList({ label, keys }: { label: string; keys: string[] }) {
    if (keys.length === 0) return null;
    return (
        <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {keys.length} {label}
            </summary>
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto font-mono text-muted-foreground scrollbar-thin">
                {keys.map((key) => (
                    <li key={key}>{key}</li>
                ))}
            </ul>
        </details>
    );
}

export default function TranslationsSection() {
    const { pending, run } = useAdminAction();
    const [reports, setReports] = useState<LanguageReport[] | null>(null);

    const checkAll = useCallback(async () => {
        const result = await run(async () => {
            const languages = await getAllLanguages();
            return Promise.all(languages.map(checkLanguage));
        });
        setReports(result ?? []);
    }, [run]);

    useEffect(() => {
        void checkAll();
    }, [checkAll]);

    const fix = async (language: string, kind: "fill" | "remove") => {
        const result = await run(async () => {
            const response = kind === "fill" ? await fillMissingTranslations(language) : await removeExtraTranslations(language);
            if (!response.success) throw new Error(response.error);
            return checkLanguage(language);
        }, kind === "fill" ? `Filled missing ${language} keys with English` : `Removed extra ${language} keys`);
        if (result) setReports((current) => current?.map((report) => (report.language === language ? result : report)) ?? null);
    };

    return (
        <AdminSection title="Translations" description="Compares each language file in src/messages with en.json. Fixes write to the files on this server.">
            <AdminGroup
                title="Languages"
                action={
                    <Button variant="ghost" size="sm" onClick={checkAll} disabled={pending}>
                        <RefreshCw /> Check again
                    </Button>
                }
            >
                <ul className="divide-y divide-border/60 border-y border-border/60">
                    {reports === null ? (
                        <EmptyRow>Checking translations...</EmptyRow>
                    ) : (
                        reports.map(({ language, totalKeys, missingKeys, extraKeys }) => {
                            const complete = totalKeys ? Math.round(((totalKeys - missingKeys.length) / totalKeys) * 100) : 100;
                            return (
                                <li key={language} className="py-3">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                        <span className="w-10 font-mono text-sm font-semibold uppercase">{language}</span>
                                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                                            <div className={`h-full ${complete === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${complete}%` }} />
                                        </div>
                                        <span className="text-sm tabular-nums text-muted-foreground">{complete}%</span>
                                        <div className="ml-auto flex gap-2">
                                            {missingKeys.length > 0 && (
                                                <Button variant="outline" size="sm" onClick={() => fix(language, "fill")} disabled={pending}>
                                                    Fill {missingKeys.length} with English
                                                </Button>
                                            )}
                                            {extraKeys.length > 0 && (
                                                <Button variant="outline" size="sm" onClick={() => fix(language, "remove")} disabled={pending}>
                                                    Remove {extraKeys.length} extra
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <KeyList label="missing keys" keys={missingKeys} />
                                    <KeyList label="extra keys" keys={extraKeys} />
                                </li>
                            );
                        })
                    )}
                </ul>
            </AdminGroup>
        </AdminSection>
    );
}
