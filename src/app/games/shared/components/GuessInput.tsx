import { Button } from "@/components/ui/button";
import { useState, useEffect, useId, useRef } from "react";
import { GameClient } from "@/lib/game/client";
import { useTranslationsContext } from "@/context/translations-provider";
import { soundManager } from "@/lib/game/sounds";
import { createLatestRequestGate } from "@/lib/latest-request";

interface GuessInputProps {
    guess: string;
    setGuess: (guess: string) => void;
    isRevealed: boolean;
    onGuess: () => void;
    onSkip: () => void;
    gameClient: GameClient;
}

export default function GuessInput({ guess, setGuess, isRevealed, onGuess, onSkip, gameClient }: GuessInputProps) {
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
        if (!isRevealed && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isRevealed]);

    useEffect(() => {
        if (!guess) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(-1);
        }
    }, [guess]);

    useEffect(() => {
        const request = requestGate.current.begin();

        if (!isSelectingRef.current && guess.trim() && !isRevealed) {
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
    }, [guess, gameClient, isRevealed, t.game.input.suggestionsAvailable]);

    useEffect(() => {
        setSuggestions([]);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        isSelectingRef.current = false;
    }, [isRevealed]);

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

    const handleSubmit = () => {
        soundManager.play("click");
        onGuess();
    };

    const handleSkip = () => {
        soundManager.play("skip");
        onSkip();
    };

    const handleSuggestionSelect = (suggestion: string) => {
        if (isRevealed) return;

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
        if (isRevealed) return;

        if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSkip();
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
            case "Tab":
                if (suggestions.length > 0) {
                    e.preventDefault();
                    const nextIndex = e.shiftKey ? (selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1) : selectedIndex >= suggestions.length - 1 ? 0 : selectedIndex + 1;
                    setSelectedIndex(nextIndex);
                }
                break;
            case "Enter":
                if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                    handleSuggestionSelect(suggestions[selectedIndex]);
                } else if (!isRevealed) {
                    handleSubmit();
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

    return (
        <div className="motion-fade-up bg-card p-6 rounded-xl border border-border/50">
            <h2 className="text-xl font-semibold mb-4">{t.game.input.title}</h2>
            <div className="relative">
                <input
                    type="text"
                    ref={inputRef}
                    value={guess}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(!!guess)}
                    onBlur={() => {
                        requestAnimationFrame(() => {
                            if (!clickingRef.current) {
                                setShowSuggestions(false);
                            }
                        });
                    }}
                    className="w-full p-3 rounded-lg bg-secondary text-foreground border border-border/50 transition-[border-color,box-shadow,background-color,opacity] duration-150 ease-[var(--ease-out-smooth)] focus:outline-none focus:border-primary/55 focus:ring-2 focus:ring-primary focus:shadow-[0_0_0_4px_hsl(var(--primary)/0.08)] disabled:opacity-60"
                    placeholder={t.game.input.placeholder}
                    disabled={isRevealed}
                    role="combobox"
                    aria-label={t.game.input.title}
                    aria-autocomplete="list"
                    aria-expanded={showSuggestions && suggestions.length > 0}
                    aria-controls={showSuggestions && suggestions.length > 0 ? listboxId : undefined}
                    aria-activedescendant={showSuggestions && selectedIndex >= 0 ? `${listboxId}-option-${selectedIndex}` : undefined}
                />

                {showSuggestions && suggestions.length > 0 && (
                    <div id={listboxId} role="listbox" aria-label={t.game.input.suggestions} className="motion-scale-in absolute w-full mt-1 bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden z-50 origin-top">
                        <div className="max-h-[300px] overflow-y-auto backdrop-blur-sm">
                            {suggestions.map((suggestion, index) => (
                                <div
                                    key={suggestion}
                                    id={`${listboxId}-option-${index}`}
                                    role="option"
                                    aria-selected={index === selectedIndex}
                                    className={`px-4 py-2 cursor-pointer transition-[background-color,color] duration-150 ease-[var(--ease-out-smooth)]
                                               ${index === selectedIndex ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary/50"}`}
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
            <div className="flex gap-4 mt-4">
                <Button className="flex-1" onClick={onGuess} disabled={!guess || isRevealed}>
                    {t.game.input.submit}
                </Button>
                <div className="flex-1">
                    <Button variant="outline" onClick={handleSkip} disabled={isRevealed} className="w-full hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors">
                        {t.game.input.skip}
                    </Button>
                </div>
            </div>
        </div>
    );
}
