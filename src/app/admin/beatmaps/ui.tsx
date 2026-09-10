"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { listMapsets, removeMapset, fetchBackgroundImage, Mapset } from "../actions/mapsets";

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
    const limit = 50;

    const fetchImages = useCallback(async (list: Mapset[]) => {
        const imgs: Record<number, string | null> = {};
        await Promise.all(
            list.map(async (mapset) => {
                if (!mapset.image_filename) {
                    imgs[mapset.mapset_id] = null;
                    return;
                }

                try {
                    imgs[mapset.mapset_id] = await fetchBackgroundImage(mapset.image_filename);
                } catch {
                    imgs[mapset.mapset_id] = null;
                }
            })
        );
        setImages(imgs);
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
        <div className="container mx-auto max-w-6xl px-4 py-6 md:py-10">
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

            <div className="divide-y divide-border/60 border-b border-border/60">
                {mapsets.map((mapset) => (
                    <div key={mapset.mapset_id} className="grid gap-4 py-4 sm:grid-cols-[auto_8rem_minmax(0,1fr)_auto] sm:items-center">
                        <input
                            type="checkbox"
                            aria-label={`Select ${mapset.title}`}
                            checked={!!selected[mapset.mapset_id]}
                            onChange={() => handleToggle(mapset.mapset_id)}
                            className="size-4 accent-primary"
                        />

                        <div className="h-[4.5rem] w-32 overflow-hidden rounded-md bg-muted sm:w-full">
                            {images[mapset.mapset_id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={images[mapset.mapset_id] as string} alt="" className="h-full w-full object-cover" />
                            ) : mapset.image_filename ? (
                                <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">Loading image...</div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
                            )}
                        </div>

                        <div className="min-w-0">
                            <div className="truncate font-medium">{mapset.title}</div>
                            <div className="mt-1 truncate text-sm text-muted-foreground">{mapset.artist}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>mapped by {mapset.mapper}</span>
                                <span>ID {mapset.mapset_id}</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button asChild size="sm" variant="ghost">
                                <a href={`https://osu.ppy.sh/beatmapsets/${mapset.mapset_id}`} target="_blank" rel="noreferrer">
                                    Open <ExternalLink />
                                </a>
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(mapset.mapset_id)} disabled={isLoading} className="text-destructive hover:text-destructive">
                                <Trash2 /> Remove
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
