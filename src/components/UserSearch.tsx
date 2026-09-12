"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { searchUsersPageAction } from "@/actions/user-server";
import { useTranslationsContext } from "@/context/translations-provider";
import { createLatestRequestGate } from "@/lib/latest-request";

interface SearchResult {
    bancho_id: number;
    username: string;
    avatar_url: string;
}

const SEARCH_RESULT_LIMIT = 10;

export default function UserSearch() {
    const { t } = useTranslationsContext();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [totalResults, setTotalResults] = useState(0);
    const [page, setPage] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const requestGate = useRef(createLatestRequestGate());

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        const request = requestGate.current.begin();

        if (query.length < 2) {
            setResults([]);
            setTotalResults(0);
            setIsSearching(false);
            setSearchError(false);
            return () => request.cancel();
        }

        setSearchError(false);

        const delayDebounceFn = setTimeout(async () => {
            if (request.isCurrent()) {
                setIsSearching(true);
            }

            try {
                const searchResults = await searchUsersPageAction(query, SEARCH_RESULT_LIMIT, page * SEARCH_RESULT_LIMIT);
                if (request.isCurrent()) {
                    setResults(searchResults.users);
                    setTotalResults(searchResults.total);
                }
            } catch (error) {
                if (request.isCurrent()) {
                    console.error("Search failed:", error);
                    setResults([]);
                    setTotalResults(0);
                    setSearchError(true);
                }
            } finally {
                if (request.isCurrent()) {
                    setIsSearching(false);
                }
            }
        }, 300);

        return () => {
            clearTimeout(delayDebounceFn);
            request.cancel();
        };
    }, [query, page]);

    const handleSelect = () => {
        setIsOpen(false);
        setQuery("");
        setPage(0);
    };

    const totalPages = Math.ceil(totalResults / SEARCH_RESULT_LIMIT);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto gap-2">
                    <Search className="h-4 w-4" />
                    <span className="text-muted-foreground inline">{t.user.search.title}</span>
                    <kbd className="hidden sm:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded-sm border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-2">
                        {t.user.search.shortcut}
                    </kbd>
                </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
                <VisuallyHidden>
                    <DialogTitle>{t.user.search.title}</DialogTitle>
                    <DialogDescription>{t.user.search.description}</DialogDescription>
                </VisuallyHidden>
                <form role="search" aria-label={t.user.search.title} className="border-b p-4 pr-12" onSubmit={(event) => event.preventDefault()}>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/50" />
                        <Input
                            autoFocus
                            type="search"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPage(0);
                            }}
                            placeholder={t.user.search.placeholder}
                            aria-label={t.user.search.placeholder}
                            className="pl-9 pr-4"
                        />
                    </div>
                </form>

                <span className="sr-only" role="status" aria-live="polite">
                    {isSearching ? t.user.search.searching : totalResults > 0 ? t.user.search.resultsFound.replace("{count}", totalResults.toString()) : ""}
                </span>

                <div className="max-h-[min(70vh,40rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" aria-busy={isSearching}>
                    {isSearching ? (
                        <div className="p-8 text-center text-foreground/70">
                            <span className="soft-loading-dot inline-block">{t.user.search.searching}</span>
                        </div>
                    ) : searchError ? (
                        <div className="p-8 text-center text-destructive">{t.user.search.failed}</div>
                    ) : results.length > 0 ? (
                        <>
                            <div className="px-4 py-2 text-xs text-foreground/60">{t.user.search.resultsFound.replace("{count}", totalResults.toString())}</div>
                            <ul className="py-1" aria-label={t.user.search.results}>
                                {results.map((user) => (
                                    <li key={user.bancho_id.toString()}>
                                        <Link
                                            href={`/user/${user.bancho_id.toString()}`}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 transition-[background-color,color] duration-150 ease-smooth hover:bg-accent/50"
                                            onClick={() => handleSelect()}
                                        >
                                            <Image src={user.avatar_url || "/placeholder.svg"} alt="" width={36} height={36} unoptimized className="rounded-full" />
                                            <span className="font-medium">{user.username}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            {totalPages > 1 && (
                                <div className="sticky bottom-0 flex items-center justify-between border-t bg-background px-3 py-2">
                                    <Button variant="ghost" size="sm" disabled={page === 0 || isSearching} onClick={() => setPage((current) => current - 1)} aria-label={t.user.search.previousPage}>
                                        <ChevronLeft className="h-4 w-4" />
                                        <span className="hidden sm:inline">{t.user.search.previous}</span>
                                    </Button>
                                    <span className="text-xs text-foreground/60">{t.user.search.page.replace("{page}", (page + 1).toString()).replace("{total}", totalPages.toString())}</span>
                                    <Button variant="ghost" size="sm" disabled={page + 1 >= totalPages || isSearching} onClick={() => setPage((current) => current + 1)} aria-label={t.user.search.nextPage}>
                                        <span className="hidden sm:inline">{t.user.search.next}</span>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : query.length >= 2 ? (
                        <div className="p-8 text-center text-foreground/70">{t.user.search.noResults}</div>
                    ) : (
                        <div className="p-8 text-center text-foreground/70">{t.user.search.startTyping}</div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
