"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addMapset, addMapsetFromList } from "../actions/mapsets";
import { AdminGroup, AdminSection, FileToTextButton, ImportResults, useAdminAction, type ImportOutcome } from "../ui";

export default function MapsetsSection() {
    const { pending, run } = useAdminAction();
    const [mapsetId, setMapsetId] = useState("");
    const [urls, setUrls] = useState("");
    const [results, setResults] = useState<ImportOutcome[]>([]);

    const importOne = async (event: React.FormEvent) => {
        event.preventDefault();
        const id = Number(mapsetId);
        const result = await run(async () => {
            const response = await addMapset(id);
            if (!response.success) throw new Error(response.error ?? "Import failed");
            return response;
        }, (response) => (response.note === "already_exists" ? `Mapset ${id} is already imported` : `Imported mapset ${id}`));
        if (result) setMapsetId("");
    };

    const importList = async () => {
        const result = await run(() => addMapsetFromList(urls), ({ successful, failed }) => `${successful} succeeded, ${failed} failed`);
        if (!result) return;
        setResults(result.results.map(({ id, success, note, error }) => ({ id, status: success ? (note === "already_exists" ? "skipped" : "imported") : "failed", detail: error })));
        if (result.failed === 0) setUrls("");
    };

    return (
        <AdminSection title="Mapsets" description="Import beatmapsets for Background and Audio Guessr. Audio must be MP3; backgrounds come from the osu! cover.">
            <AdminGroup
                title="Import one"
                action={
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/admin/beatmaps">
                            Browse imported mapsets <ArrowRight />
                        </Link>
                    </Button>
                }
            >
                <form onSubmit={importOne} className="flex max-w-md items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="mapset-id">Beatmapset ID</Label>
                        <Input id="mapset-id" type="number" min={1} placeholder="39804" value={mapsetId} onChange={(event) => setMapsetId(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={pending || !mapsetId}>
                        {pending ? "Importing..." : "Import"}
                    </Button>
                </form>
            </AdminGroup>

            <AdminGroup title="Import many" description="Paste beatmapset URLs, one per line. Up to 50 at a time; already imported mapsets are skipped.">
                <Textarea
                    aria-label="Beatmapset URLs"
                    rows={6}
                    className="font-mono text-xs"
                    placeholder={"https://osu.ppy.sh/beatmapsets/39804\nhttps://osu.ppy.sh/beatmapsets/1002271"}
                    value={urls}
                    onChange={(event) => setUrls(event.target.value)}
                />
                <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Button onClick={importList} disabled={pending || !urls.trim()}>
                        {pending ? "Importing..." : "Import list"}
                    </Button>
                    <FileToTextButton onLoad={setUrls} disabled={pending} />
                </div>
                <ImportResults results={results} />
            </AdminGroup>
        </AdminSection>
    );
}
