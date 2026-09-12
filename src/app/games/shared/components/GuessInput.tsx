import { Button } from "@/components/ui/button";
import { useState, useEffect, useId, useRef } from "react";
import { GameMode, type GameVariant } from "@/actions/types";
import { GameClient } from "@/lib/game/client";
import { useTranslationsContext } from "@/context/translations-provider";
import { createLatestRequestGate } from "@/lib/latest-request";

interface GuessInputProps {
    gameMode: GameMode;
    gameVariant: GameVariant;
    guess: string;
    setGuess: (guess: string) => void;
    isRevealed: boolean;
    revealedGuess: string;
    isBusy: boolean;
    onGuess: () => void;
    onSkip: () => void;
    onNextRound: () => void;
    nextRoundLabel: string;
    gameClient: GameClient;
}

export default function GuessInput({ gameMode, gameVariant, guess, setGuess, isRevealed, revealedGuess, isBusy, onGuess, onSkip, onNextRound, nextRoundLabel, gameClient }: GuessInputProps) {
    const { t } = useTranslationsContext();
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [announcement, setAnnouncement] = useState("");
    const listboxId = useId();

    const clickingRef = useRef(false);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isSelectingRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const requestGate = useRef(createLatestRequestGate());

    useEffect(() => {
        if (!isRevealed && !isBusy && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isRevealed, isBusy]);

    useEffect(() => {
        if (!guess) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(-1);
        }
    }, [guess]);

    useEffect(() => {
        const request = requestGate.current.begin();

        if (!isSelectingRef.current && guess.trim() && !isRevealed && !isBusy) {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }

            debounceTimeoutRef.current = setTimeout(async () => {
                try {
                    const newSuggestions = await gameClient.getSuggestions(guess);
                    if (request.isCurrent()) {
                        setSuggestions(newSuggestions);
                        setShowSuggestions(newSuggestions.length > 0);
                        setSelectedIndex(newSuggestions.length > 0 ? 0 : -1);
                        setAnnouncement(t.game.input.suggestionsAvailable.replace("{count}", newSuggestions.length.toString()));
                    }
                } catch (error) {
                    if (request.isCurrent()) {
                        console.error("Failed to load suggestions:", error);
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setSelectedIndex(-1);
                        setAnnouncement("");
                    }
                }
            }, 100);
        }

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            request.cancel();
        };
    }, [guess, gameClient, isRevealed, isBusy, t.game.input.suggestionsAvailable]);

    useEffect(() => {
        setSuggestions([]);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        isSelectingRef.current = false;
    }, [isRevealed, isBusy]);

    useEffect(() => {
        if (suggestions.length > 0) {
            setSelectedIndex(0);
        } else {
            setSelectedIndex(-1);
        }
    }, [suggestions]);

    useEffect(() => {
        if (showSuggestions && selectedIndex >= 0 && suggestions[selectedIndex]) {
            setAnnouncement(t.game.input.suggestionSelected.replace("{suggestion}", suggestions[selectedIndex]));
        }
    }, [selectedIndex, showSuggestions, suggestions, t.game.input.suggestionSelected]);

    const handleSuggestionSelect = (suggestion: string) => {
        if (isRevealed || isBusy) return;

        isSelectingRef.current = true;
        setGuess(suggestion);
        setShowSuggestions(false);
        setSuggestions([]);
        setAnnouncement(t.game.input.suggestionSelected.replace("{suggestion}", suggestion));
        setTimeout(() => {
            isSelectingRef.current = false;
        }, 100);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (isRevealed || isBusy) return;

        if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSkip();
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, -1));
                break;
            case "Enter":
                if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                    handleSuggestionSelect(suggestions[selectedIndex]);
                } else if (!isRevealed) {
                    onGuess();
                }
                break;
            case "Escape":
                setShowSuggestions(false);
                break;
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setGuess(v);
        if (!isSelectingRef.current) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(-1);
        }
    };

    if (isRevealed) {
        return (
            <div className="motion-fade-up">
                <h2 className="mb-3 text-base font-semibold tracking-tight lg:text-lg">{t.game.input.yourGuess}</h2>
                <input
                    type="text"
                    value={revealedGuess}
                    readOnly
                    aria-label={t.game.input.yourGuess}
                    className="w-full rounded-md border border-border bg-muted/30 px-3 py-3 text-base text-foreground outline-none lg:py-3.5 lg:text-lg"
                />
                <div className="mt-3">
                    <Button className="h-11 w-full lg:h-12 lg:text-base" onClick={onNextRound} disabled={isBusy}>
                        {nextRoundLabel}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="motion-fade-up">
            <h2 className="mb-3 text-base font-semibold tracking-tight lg:text-lg">{t.game.input.title}</h2>
            <div className="relative">
                <input
                    type="text"
                    ref={inputRef}
                    value={guess}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(!isBusy && !!guess)}
                    onBlur={() => {
                        requestAnimationFrame(() => {
                            if (!clickingRef.current) {
                                setShowSuggestions(false);
                            }
                        });
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-3 text-base text-foreground transition-[border-color,opacity] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60 lg:py-3.5 lg:text-lg"
                    placeholder={gameMode === GameMode.Skin ? t.game.input.skinPlaceholder : t.game.input.placeholder}
                    disabled={isRevealed || isBusy}
                    role="combobox"
                    aria-label={t.game.input.title}
                    aria-autocomplete="list"
                    aria-expanded={showSuggestions && suggestions.length > 0}
                    aria-controls={showSuggestions && suggestions.length > 0 ? listboxId : undefined}
                    aria-activedescendant={showSuggestions && selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
                />

                {showSuggestions && suggestions.length > 0 && (
                    <div id={listboxId} role="listbox" aria-label={t.game.input.suggestions} className="motion-scale-in absolute z-50 mt-1 w-full origin-top overflow-hidden border border-border/60 bg-background shadow-lg">
                        <div className="max-h-[min(240px,35dvh)] divide-y divide-border/40 overflow-y-auto backdrop-blur-sm">
                            {suggestions.map((suggestion, index) => (
                                <div
                                    key={suggestion}
                                    id={`${listboxId}-option-${index}`}
                                    role="option"
                                    aria-selected={index === selectedIndex}
                                    className={`cursor-pointer px-4 py-2.5 transition-[background-color,color] duration-150 ease-smooth
                                               ${index === selectedIndex ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary/50"}`}
                                    onMouseDown={() => {
                                        clickingRef.current = true;
                                    }}
                                    onMouseUp={() => {
                                        clickingRef.current = false;
                                        handleSuggestionSelect(suggestion);
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    {suggestion}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {announcement}
            </span>
            <div className="mt-3 flex gap-2">
                <Button className="h-11 min-w-0 flex-1 lg:h-12 lg:text-base" onClick={onGuess} disabled={!guess.trim() || isBusy}>
                    {t.game.input.submit}
                </Button>
                <Button variant="ghost" onClick={onSkip} disabled={isBusy} className="h-11 min-w-0 flex-1 border border-border/60 transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive lg:h-12 lg:text-base">
                    {gameVariant === "survival" ? t.game.input.skipDeath : t.game.input.skip}
                </Button>
            </div>
        </div>
    );
}
