"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { fetchBackgroundImage, listMapsets, removeMapset, Mapset } from "../actions/mapsets";

interface BeatmapsAdminProps {
    initialMapsets: Mapset[];
}

export default function BeatmapsAdmin({ initialMapsets }: BeatmapsAdminProps) {
    const [mapsets, setMapsets] = useState<Mapset[]>(initialMapsets);
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [output, setOutput] = useState(`Loaded ${initialMapsets.length} mapsets`);
    const [images, setImages] = useState<Record<number, string | null>>({});
    const [page, setPage] = useState(1);
    const isInitialRender = useRef(true);
    const initialMapsetsRef = useRef(initialMapsets);
    const limit = 25;

    const fetchImages = useCallback(async (list: Mapset[]) => {
        const nextImages: Record<number, string | null> = {};
        await Promise.all(
            list.map(async (mapset) => {
                if (!mapset.image_filename) {
                    nextImages[mapset.mapset_id] = null;
                    return;
                }

                try {
                    nextImages[mapset.mapset_id] = await fetchBackgroundImage(mapset.image_filename);
                } catch {
                    nextImages[mapset.mapset_id] = null;
                }
            }),
        );
        setImages(nextImages);
    }, []);

    const fetchMapsets = useCallback(async (p = 1, q = "") => {
        setIsLoading(true);
        setOutput("Loading mapsets...");
        setSelected({});
        try {
            setImages({});
            const list = await listMapsets(p, limit, q);
            setMapsets(list || []);
            setOutput(`Loaded ${list.length} mapsets`);
            await fetchImages(list || []);
        } catch (err) {
            setOutput(`Error loading mapsets: ${String(err)}`);
        } finally {
            setIsLoading(false);
        }
    }, [fetchImages]);

    useEffect(() => {
        if (isInitialRender.current) {
            isInitialRender.current = false;
            void fetchImages(initialMapsetsRef.current);
            return;
        }

        void fetchMapsets(page, search);
    }, [fetchImages, fetchMapsets, page, search]);

    const handleSearch = (event: FormEvent) => {
        event.preventDefault();
        const nextSearch = searchInput.trim();
        if (page === 1 && nextSearch === search) {
            fetchMapsets(1, nextSearch);
            return;
        }
        setPage(1);
        setSearch(nextSearch);
    };

    const handleClearSearch = () => {
        setSearchInput("");
        setPage(1);
        setSearch("");
    };

    const handleDelete = async (id: number) => {
        if (!confirm(`Delete mapset ${id}? This will remove audio/image and db records.`)) return;
        setIsLoading(true);
        setOutput(`Removing ${id}...`);
        try {
            await removeMapset(id);
            setOutput(`Removed ${id}`);
            await fetchMapsets(page, search);
        } catch (err) {
            setOutput(`Failed to remove ${id}: ${String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = (id: number) => {
        setSelected((current) => ({ ...current, [id]: !current[id] }));
    };

    const handleSelectAll = () => {
        const allOn = mapsets.length > 0 && mapsets.every((mapset) => selected[mapset.mapset_id]);
        if (allOn) {
            setSelected({});
            return;
        }

        const next: Record<number, boolean> = {};
        mapsets.forEach((mapset) => (next[mapset.mapset_id] = true));
        setSelected(next);
    };

    const handleBulkDelete = async () => {
        const ids = Object.keys(selected)
            .filter((key) => selected[Number(key)])
            .map((key) => Number(key));
        if (ids.length === 0) return;
        if (!confirm(`Delete ${ids.length} selected mapset(s)? This will remove audio/image and db records.`)) return;
        setIsLoading(true);
        try {
            for (const id of ids) {
                setOutput(`Removing ${id}...`);
                await removeMapset(id);
            }
            setOutput(`Removed ${ids.length} mapsets`);
            await fetchMapsets(page, search);
        } catch (err) {
            setOutput(`Bulk delete failed: ${String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const selectedCount = Object.values(selected).filter(Boolean).length;
    const allSelected = mapsets.length > 0 && mapsets.every((mapset) => selected[mapset.mapset_id]);

    return (
        <div className="page-container py-6 md:py-10">
            <header className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3 text-muted-foreground">
                        <Link href="/admin"><ArrowLeft /> Admin</Link>
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Beatmaps</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Search, inspect, and remove imported mapsets.</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isLoading && <Loader2 className="size-4 animate-spin" />}
                    <span>{output}</span>
                </div>
            </header>

            <form onSubmit={handleSearch} className="sticky top-0 z-10 -mx-2 flex flex-col gap-3 border-b border-border/60 bg-background/95 px-2 py-4 backdrop-blur sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1 sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input aria-label="Search beatmaps" className="pl-9" placeholder="Search artist or title" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={isLoading}>Search</Button>
                    {search && <Button type="button" size="sm" variant="ghost" onClick={handleClearSearch} disabled={isLoading}>Clear</Button>}
                    <Button type="button" size="sm" variant="outline" onClick={handleSelectAll} disabled={isLoading || mapsets.length === 0}>
                        {allSelected ? "Unselect page" : "Select page"}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={handleBulkDelete} disabled={isLoading || selectedCount === 0}>
                        <Trash2 />
                        Delete {selectedCount > 0 ? selectedCount : "selected"}
                    </Button>
                </div>
            </form>

            <div className="hidden grid-cols-[auto_5rem_minmax(0,1fr)_6rem_auto] items-center gap-4 border-b border-border/60 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                <span className="w-4" aria-hidden="true" />
                <span aria-hidden="true" />
                <span>Mapset</span>
                <span>ID</span>
                <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-border/60 border-b border-border/60">
                {mapsets.map((mapset) => (
                    <div key={mapset.mapset_id} className="grid grid-cols-[auto_4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_5rem_minmax(0,1fr)_6rem_auto] sm:items-center sm:gap-x-4">
                        <input
                            type="checkbox"
                            aria-label={`Select ${mapset.title}`}
                            checked={!!selected[mapset.mapset_id]}
                            onChange={() => handleToggle(mapset.mapset_id)}
                            className="mt-1 size-4 accent-primary sm:mt-0"
                        />

                        <div className="h-12 w-[4.5rem] overflow-hidden rounded-md bg-muted sm:h-14 sm:w-20">
                            {images[mapset.mapset_id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={images[mapset.mapset_id] as string} alt="" className="h-full w-full object-cover" />
                            ) : mapset.image_filename ? (
                                <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground">Loading</div>
                            ) : (
                                <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground">No image</div>
                            )}
                        </div>

                        <div className="min-w-0">
                            <div className="truncate font-medium">{mapset.title}</div>
                            <div className="mt-0.5 truncate text-sm text-muted-foreground">{mapset.artist} · mapped by {mapset.mapper}</div>
                        </div>

                        <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">{mapset.mapset_id}</span>

                        <div className="col-start-3 flex gap-1 sm:col-start-auto sm:justify-end">
                            <Button asChild size="icon" variant="ghost">
                                <a href={`https://osu.ppy.sh/beatmapsets/${mapset.mapset_id}`} target="_blank" rel="noreferrer" aria-label={`Open ${mapset.title} on osu!`} title="Open on osu!">
                                    <ExternalLink />
                                </a>
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`Remove ${mapset.title}`} title="Remove mapset" onClick={() => handleDelete(mapset.mapset_id)} disabled={isLoading} className="text-destructive hover:text-destructive">
                                <Trash2 />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {mapsets.length === 0 && !isLoading && (
                <div className="py-16 text-center text-sm text-muted-foreground">{search ? `No mapsets found for “${search}”.` : "No mapsets found."}</div>
            )}

            <footer className="flex items-center justify-between gap-4 py-5">
                <span className="text-sm text-muted-foreground">Page {page}</span>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={isLoading || page === 1}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={() => setPage((current) => current + 1)} disabled={isLoading || mapsets.length < limit}>Next</Button>
                </div>
            </footer>
        </div>
    );
}
