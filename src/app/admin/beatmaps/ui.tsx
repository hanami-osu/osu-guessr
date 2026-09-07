"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { listMapsets, removeMapset, fetchBackgroundImage, Mapset } from "../actions/mapsets";

export default function BeatmapsAdmin() {
    const [mapsets, setMapsets] = useState<Mapset[]>([]);
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [output, setOutput] = useState("");
    const [images, setImages] = useState<Record<number, string | null>>({});
    const [page, setPage] = useState(1);
    const limit = 50;

    const fetchMapsets = async (p = 1, q = "") => {
        setIsLoading(true);
        setOutput("Loading mapsets...");
        try {
            setImages({});
            const list = await listMapsets(p, limit, q);
            setMapsets(list || []);
            setOutput(`Loaded ${list.length} mapsets`);

            const imgs: Record<number, string | null> = {};
            await Promise.all(
                (list || []).map(async (m: Mapset) => {
                    if (m.image_filename) {
                        try {
                            const data = await fetchBackgroundImage(m.image_filename);
                            imgs[m.mapset_id] = data;
                        } catch {
                            imgs[m.mapset_id] = null;
                        }
                    } else {
                        imgs[m.mapset_id] = null;
                    }
                })
            );
            setImages(imgs);
        } catch (err) {
            setOutput(`Error loading mapsets: ${String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMapsets(page, search);
    }, [page, search]);

    const handleDelete = async (id: number) => {
        if (!confirm(`Delete mapset ${id}? This will remove audio/image and db records.`)) return;
        setIsLoading(true);
        setOutput(`Removing ${id}...`);
        try {
            await removeMapset(id);
            setOutput(`Removed ${id}`);
            await fetchMapsets(page);
        } catch (err) {
            setOutput(`Failed to remove ${id}: ${String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = (id: number) => {
        setSelected((s) => ({ ...s, [id]: !s[id] }));
    };

    const handleSelectAll = () => {
        const allOn = mapsets.every((m) => selected[m.mapset_id]);
        if (allOn) {
            setSelected({});
        } else {
            const next: Record<number, boolean> = {};
            mapsets.forEach((m) => (next[m.mapset_id] = true));
            setSelected(next);
        }
    };

    const handleBulkDelete = async () => {
        const ids = Object.keys(selected)
            .filter((k) => selected[Number(k)])
            .map((k) => Number(k));
        if (ids.length === 0) return;
        if (!confirm(`Delete ${ids.length} selected mapset(s)? This will remove audio/image and db records.`)) return;
        setIsLoading(true);
        try {
            for (const id of ids) {
                setOutput(`Removing ${id}...`);
                await removeMapset(id);
            }
            setOutput(`Removed ${ids.length} mapsets`);
            setSelected({});
            await fetchMapsets(page, search);
        } catch (err) {
            setOutput(`Bulk delete failed: ${String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const prevPage = () => setPage((p) => Math.max(1, p - 1));
    const nextPage = () => setPage((p) => p + 1);

    return (
        <div className="space-y-6 p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-4">
                    <Link href="/admin">
                        <Button variant="ghost" size="sm">
                            Back
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold">Beatmaps</h1>
                </div>

                <div className="text-sm text-muted-foreground break-words lg:text-right">{output}</div>
            </div>

            <div className="flex flex-col gap-3 border-y border-border/60 py-4 sm:flex-row sm:flex-wrap sm:items-center">
                <Input className="sm:max-w-xs" placeholder="Search artist or title" value={search} onChange={(e) => setSearch(e.target.value)} />
                <Button size="sm" onClick={() => fetchMapsets(1, search)}>
                    Search
                </Button>
                <Button size="sm" onClick={handleSelectAll}>
                    {mapsets.every((m) => selected[m.mapset_id]) ? "Unselect all" : "Select all"}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                    Delete selected
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {mapsets.map((m) => (
                    <div key={m.mapset_id} className="border-t border-border/60 py-4 flex flex-col">
                        <div className="flex items-start gap-4">
                            <div>
                                <input type="checkbox" checked={!!selected[m.mapset_id]} onChange={() => handleToggle(m.mapset_id)} />
                            </div>
                            <div className="w-28 h-16 relative rounded overflow-hidden bg-muted shrink-0">
                                {images[m.mapset_id] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={images[m.mapset_id] as string} alt={m.title} className="w-full h-full object-cover" />
                                ) : m.image_filename ? (
                                    <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Loading image...</div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No image</div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="font-semibold">{m.title}</div>
                                <div className="text-sm text-muted-foreground">
                                    {m.artist} / {m.mapper}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">ID: {m.mapset_id}</div>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(m.mapset_id)}>
                                Delete
                            </Button>
                            <a href={`https://osu.ppy.sh/beatmapsets/${m.mapset_id}`} target="_blank" rel="noreferrer" className="sm:w-auto">
                                <Button size="sm" className="w-full sm:w-auto">
                                    Open osu!
                                </Button>
                            </a>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-center">
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={prevPage} disabled={page === 1}>
                        Prev
                    </Button>
                    <div className="text-sm">Page {page}</div>
                    <Button size="sm" onClick={nextPage}>
                        Next
                    </Button>
                </div>
            </div>

            {mapsets.length === 0 && !isLoading && <div className="text-muted-foreground">No mapsets found.</div>}
        </div>
    );
}
