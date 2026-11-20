"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addSkinById, addSkinsFromList, listSkins, removeSkin } from "../actions/skins";
import { AdminGroup, AdminSection, EmptyRow, FileToTextButton, ImportResults, useAdminAction, type ImportOutcome } from "../ui";

type Skin = Awaited<ReturnType<typeof listSkins>>[number];

function parseSkinIds(text: string): number[] {
    return [...new Set(text.split(/[\s,]+/).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

export default function SkinsSection() {
    const { pending, run } = useAdminAction();
    const [skins, setSkins] = useState<Skin[] | null>(null);
    const [filter, setFilter] = useState("");
    const [skinId, setSkinId] = useState("");
    const [idList, setIdList] = useState("");
    const [results, setResults] = useState<ImportOutcome[]>([]);

    const loadSkins = useCallback(async () => setSkins((await run(listSkins)) ?? []), [run]);

    useEffect(() => {
        void loadSkins();
    }, [loadSkins]);

    const visibleSkins = useMemo(() => {
        const query = filter.trim().toLowerCase();
        return (skins ?? []).filter((skin) => !query || skin.name.toLowerCase().includes(query) || String(skin.id) === query);
    }, [filter, skins]);

    const importOne = async (event: React.FormEvent) => {
        event.preventDefault();
        const id = Number(skinId);
        const result = await run(async () => {
            const response = await addSkinById(id);
            if (!response.success) throw new Error(response.error ?? "Import failed");
            return response;
        }, `Imported skin ${id}`);
        if (!result) return;
        setSkinId("");
        await loadSkins();
    };

    const importList = async () => {
        const ids = parseSkinIds(idList);
        const result = await run(() => addSkinsFromList(ids), (rows) => `${rows.filter((row) => row.success).length} of ${rows.length} skins imported`);
        if (!result) return;
        setResults(result.map(({ id, success, error }) => ({ id, status: success ? "imported" : "failed", detail: error })));
        if (result.every((row) => row.success)) setIdList("");
        await loadSkins();
    };

    const deleteSkin = async (skin: Skin) => {
        if (!confirm(`Remove skin "${skin.name}" (${skin.id})? This deletes its image and database row.`)) return;
        const result = await run(async () => {
            const response = await removeSkin(skin.id);
            if (!response.success) throw new Error(response.error ?? "Remove failed");
            return true;
        }, `Removed ${skin.name}`);
        if (result) setSkins((current) => current?.filter(({ id }) => id !== skin.id) ?? null);
    };

    return (
        <AdminSection title="Skins" description="Skins for Skin Guessr, imported from osuck.net by their skin ID.">
            <AdminGroup title="Import">
                <form onSubmit={importOne} className="flex max-w-md items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="skin-id">Skin ID</Label>
                        <Input id="skin-id" type="number" min={1} placeholder="12345" value={skinId} onChange={(event) => setSkinId(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={pending || !skinId}>
                        Import
                    </Button>
                </form>

                <div className="mt-6 space-y-2">
                    <Label htmlFor="skin-id-list">Several skin IDs</Label>
                    <Textarea id="skin-id-list" rows={3} className="font-mono text-xs" placeholder="12345, 23456, 34567" value={idList} onChange={(event) => setIdList(event.target.value)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Button onClick={importList} disabled={pending || parseSkinIds(idList).length === 0}>
                        Import {parseSkinIds(idList).length || ""} skins
                    </Button>
                    <FileToTextButton onLoad={setIdList} disabled={pending} />
                </div>
                <ImportResults results={results} />
            </AdminGroup>

            <AdminGroup title={`Library${skins ? ` (${skins.length})` : ""}`}>
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input aria-label="Filter skins" className="pl-9" placeholder="Filter by name or ID" value={filter} onChange={(event) => setFilter(event.target.value)} />
                </div>
                <ul className="mt-4 max-h-[32rem] divide-y divide-border/60 overflow-y-auto border-y border-border/60 scrollbar-thin">
                    {skins === null ? (
                        <EmptyRow>Loading skins...</EmptyRow>
                    ) : visibleSkins.length === 0 ? (
                        <EmptyRow>{skins.length === 0 ? "No skins imported yet." : "No skins match that filter."}</EmptyRow>
                    ) : (
                        visibleSkins.map((skin) => (
                            <li key={skin.id} className="flex items-center gap-4 py-2.5">
                                <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{skin.id}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{skin.name}</span>
                                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{new Date(skin.created_at).toLocaleDateString()}</span>
                                <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
                                    <a href={`https://skins.osuck.net/skins/${skin.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${skin.name} on osuck.net`}>
                                        <ExternalLink />
                                    </a>
                                </Button>
                                <Button variant="ghost" size="icon" className="size-8 shrink-0 text-destructive hover:text-destructive" onClick={() => deleteSkin(skin)} disabled={pending} aria-label={`Remove ${skin.name}`}>
                                    <Trash2 />
                                </Button>
                            </li>
                        ))
                    )}
                </ul>
            </AdminGroup>
        </AdminSection>
    );
}
