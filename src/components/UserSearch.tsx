"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { searchUsersAction } from "@/actions/user-server";
import { useTranslationsContext } from "@/context/translations-provider";

interface SearchResult {
    bancho_id: number;
    username: string;
    avatar_url: string;
}

export default function UserSearch() {
    const { t } = useTranslationsContext();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

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
        const delayDebounceFn = setTimeout(async () => {
            if (query.length >= 2) {
                setIsSearching(true);
                try {
                    const searchResults = await searchUsersAction(query);
                    setResults(searchResults);
                } catch (error) {
                    console.error("Search failed:", error);
                    setResults([]);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const handleSelect = () => {
        setIsOpen(false);
        setQuery("");
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto gap-2">
                    <Search className="h-4 w-4" />
                    <span className="text-muted-foreground inline">{t.user.search.title}</span>
                    <kbd className="hidden sm:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-2">
                        {t.user.search.shortcut}
                    </kbd>
                </Button>
            </DialogTrigger>
            <DialogContent className="w-full sm:max-w-3xl">
                <VisuallyHidden>
                    <DialogTitle>{t.user.search.title}</DialogTitle>
                    <DialogDescription>{t.user.search.description}</DialogDescription>
                </VisuallyHidden>
                <form role="search" aria-label={t.user.search.title} className="border-b p-4" onSubmit={(event) => event.preventDefault()}>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground/50" />
                        <Input
                            autoFocus
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t.user.search.placeholder}
                            aria-label={t.user.search.placeholder}
                            className="pl-9 pr-4"
                        />
                    </div>
                </form>

                <span className="sr-only" role="status" aria-live="polite">
                    {isSearching ? t.user.search.searching : results.length > 0 ? t.user.search.resultsFound.replace("{count}", results.length.toString()) : ""}
                </span>

                <div className="max-h-[60vh] overflow-y-auto" aria-busy={isSearching}>
                    {isSearching ? (
                        <div className="p-8 text-center text-foreground/70">
                            <span className="soft-loading-dot inline-block">{t.user.search.searching}</span>
                        </div>
                    ) : results.length > 0 ? (
                        <ul className="py-2" aria-label={t.user.search.results}>
                            {results.map((user) => (
                                <li key={user.bancho_id.toString()}>
                                    <Link
                                        href={`/user/${user.bancho_id.toString()}`}
                                        className="flex w-full items-center gap-3 px-4 py-3 transition-[background-color,color] duration-150 ease-[var(--ease-out-smooth)] hover:bg-accent/50"
                                        onClick={() => handleSelect()}
                                    >
                                        <Image src={user.avatar_url || "/placeholder.svg"} alt="" width={40} height={40} className="rounded-full" />
                                        <span className="font-medium">{user.username}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
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
