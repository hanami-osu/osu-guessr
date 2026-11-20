import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED, DAILY_ROUNDS, getNextDailyReset } from "@/lib/game/daily";
import { searchManualDailyContent, setManualDailyChallenge } from "./actions/daily-challenge";
import { AdminGroup, CollapsibleSection } from "./ui";

type ManualDailyOption = { id: number; label: string };

export default function DailyChallengePanel({ appendOutput }: { appendOutput: (message: string) => void }) {
    const dailyDatePickerRef = useRef<HTMLInputElement>(null);
    const dailySearchRequestIds = useRef(Array(DAILY_ROUNDS).fill(0));
    const skipDailySearchOnce = useRef(Array(DAILY_ROUNDS).fill(false));
    const dailyListboxId = useId();

    const [manualDailyDate, setManualDailyDate] = useState("");
    const [manualDailyDateIso, setManualDailyDateIso] = useState("");
    const [manualDailyMode, setManualDailyMode] = useState("background");
    const [ignoreDailyRepetition, setIgnoreDailyRepetition] = useState(false);
    const [manualDailySearches, setManualDailySearches] = useState<string[]>(Array(DAILY_ROUNDS).fill(""));
    const [manualDailySearchResults, setManualDailySearchResults] = useState<ManualDailyOption[][]>(Array.from({ length: DAILY_ROUNDS }, () => []));
    const [manualDailySelections, setManualDailySelections] = useState<string[]>(Array(DAILY_ROUNDS).fill(""));
    const [searchingDailyRounds, setSearchingDailyRounds] = useState<boolean[]>(Array(DAILY_ROUNDS).fill(false));
    const [activeDailyRound, setActiveDailyRound] = useState<number | null>(null);
    const [activeDailyOptionIndices, setActiveDailyOptionIndices] = useState<number[]>(Array(DAILY_ROUNDS).fill(0));
    const [dailyOverwriteRequest, setDailyOverwriteRequest] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState(false);

    const dailyChallengeRequest = JSON.stringify([manualDailyDate, manualDailyMode, ignoreDailyRepetition, manualDailySelections]);

    const handleSetManualDaily = async (overwrite = false) => {
        setIsSaving(true);
        appendOutput(`${overwrite ? "Overwriting" : "Setting"} ${manualDailyMode} daily challenge for ${manualDailyDate}...`);
        try {
            appendOutput(await setManualDailyChallenge(manualDailyDate, manualDailyMode, ignoreDailyRepetition, manualDailySelections.map(Number), overwrite));
            setDailyOverwriteRequest(null);
        } catch (error) {
            if (error instanceof Error && error.message.includes(DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED)) {
                setDailyOverwriteRequest(dailyChallengeRequest);
            } else {
                appendOutput(`Error: ${error instanceof Error ? error.message : error}`);
            }
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        const timers = manualDailySearches.map((searchText, roundIndex) => {
            const query = searchText.trim();
            const requestId = ++dailySearchRequestIds.current[roundIndex];
            if (skipDailySearchOnce.current[roundIndex]) {
                skipDailySearchOnce.current[roundIndex] = false;
                setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? false : searching)));
                return null;
            }
            if (query.length < 2) {
                setManualDailySearchResults((current) => current.map((results, index) => (index === roundIndex ? [] : results)));
                setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? false : searching)));
                return null;
            }

            setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? true : searching)));
            return window.setTimeout(() => {
                void searchManualDailyContent(manualDailyMode, query)
                    .then((options) => {
                        if (dailySearchRequestIds.current[roundIndex] !== requestId) return;
                        setManualDailySearchResults((current) => current.map((items, index) => (index === roundIndex ? options : items)));
                        setActiveDailyOptionIndices((current) => current.map((selected, index) => (index === roundIndex ? 0 : selected)));
                    })
                    .catch((error: unknown) => {
                        if (dailySearchRequestIds.current[roundIndex] === requestId) {
                            appendOutput(`Could not search daily content: ${error instanceof Error ? error.message : error}`);
                        }
                    })
                    .finally(() => {
                        if (dailySearchRequestIds.current[roundIndex] === requestId) {
                            setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? false : searching)));
                        }
                    });
            }, 180);
        });

        return () => timers.forEach((timer) => timer && window.clearTimeout(timer));
    }, [appendOutput, manualDailyMode, manualDailySearches]);

    const selectManualDailyOption = (roundIndex: number, option: ManualDailyOption) => {
        skipDailySearchOnce.current[roundIndex] = true;
        setManualDailySelections((current) => current.map((selected, index) => (index === roundIndex ? String(option.id) : selected)));
        setManualDailySearches((current) => current.map((search, index) => (index === roundIndex ? option.label : search)));
        setManualDailySearchResults((current) => current.map((results, index) => (index === roundIndex ? [option] : results)));
        setActiveDailyRound(null);
    };

    const changeManualDailyMode = (mode: string) => {
        setDailyOverwriteRequest(null);
        setManualDailyMode(mode);
        if (mode === "skin" || mode === "score_pp") setIgnoreDailyRepetition(false);
        setManualDailySearches(Array(DAILY_ROUNDS).fill(""));
        setManualDailySearchResults(Array.from({ length: DAILY_ROUNDS }, () => []));
        setManualDailySelections(Array(DAILY_ROUNDS).fill(""));
        skipDailySearchOnce.current = Array(DAILY_ROUNDS).fill(false);
        setActiveDailyRound(null);
    };

    const updateManualDailyDate = (value: string) => {
        setDailyOverwriteRequest(null);
        setManualDailyDate(value);
        const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        if (!match) {
            setManualDailyDateIso("");
            return;
        }
        const [, day, month, year] = match;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        setManualDailyDateIso(date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? `${year}-${month}-${day}` : "");
    };

    const updateManualDailyDateFromPicker = (value: string) => {
        if (!value) return updateManualDailyDate("");
        const [year, month, day] = value.split("-");
        updateManualDailyDate(`${day}/${month}/${year}`);
    };

    const minManualDailyDate = getNextDailyReset().toISOString().slice(0, 10);
    const hasFiveUniqueDailyItems = manualDailySelections.every(Boolean) && new Set(manualDailySelections).size === DAILY_ROUNDS;

    return (
        <CollapsibleSection id="daily-challenge" title="Daily Challenge" description="Set daily challenge manually" icon={<CalendarDays />}>
            <AdminGroup title="Schedule a challenge" description="Choose five exact rounds for a future date. Challenges cannot be set for today or an earlier UTC date.">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="manual-daily-date">Date (dd/mm/yyyy)</Label>
                        <div className="relative flex gap-2">
                            <Input
                                id="manual-daily-date"
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="dd/mm/yyyy"
                                maxLength={10}
                                value={manualDailyDate}
                                onChange={(event) => updateManualDailyDate(event.target.value)}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Choose date from calendar"
                                onClick={() => {
                                    const picker = dailyDatePickerRef.current;
                                    if (!picker) return;
                                    if (typeof picker.showPicker === "function") picker.showPicker();
                                    else picker.click();
                                }}
                            >
                                <CalendarDays aria-hidden="true" />
                            </Button>
                            <input
                                ref={dailyDatePickerRef}
                                className="pointer-events-none absolute right-0 top-0 size-1 opacity-0"
                                type="date"
                                tabIndex={-1}
                                aria-hidden="true"
                                min={minManualDailyDate}
                                value={manualDailyDateIso}
                                onChange={(event) => updateManualDailyDateFromPicker(event.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="manual-daily-mode">Game mode</Label>
                        <Select value={manualDailyMode} onValueChange={changeManualDailyMode}>
                            <SelectTrigger id="manual-daily-mode">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="background">Background Guessr</SelectItem>
                                <SelectItem value="audio">Audio Guessr</SelectItem>
                                <SelectItem value="skin">Skin Guessr</SelectItem>
                                <SelectItem value="score_pp">Score pp</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <fieldset className="mt-6 border-t border-border/60 pt-5">
                    <legend className="mb-4 text-sm font-medium">Challenge rounds</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {manualDailySearches.map((searchText, roundIndex) => {
                            const otherSelections = new Set(manualDailySelections.filter((_, index) => index !== roundIndex));
                            const options = manualDailySearchResults[roundIndex].filter((option) => !otherSelections.has(String(option.id)));
                            const isOpen = activeDailyRound === roundIndex && searchText.trim().length >= 2;
                            const activeOptionIndex = activeDailyOptionIndices[roundIndex];
                            const listboxId = `${dailyListboxId}-round-${roundIndex}`;

                            return (
                                <div key={roundIndex} className="min-w-0 space-y-2">
                                    <Label htmlFor={`manual-daily-search-${roundIndex}`}>Round {roundIndex + 1}</Label>
                                    <div className="relative">
                                        <Input
                                            id={`manual-daily-search-${roundIndex}`}
                                            placeholder={manualDailyMode === "score_pp" ? "Player or beatmap" : manualDailyMode === "skin" ? "Skin name or ID" : "Song title or artist"}
                                            value={searchText}
                                            onFocus={() => setActiveDailyRound(roundIndex)}
                                            onBlur={(event) => {
                                                const nextTarget = event.relatedTarget;
                                                if (!(nextTarget instanceof Node && event.currentTarget.parentElement?.contains(nextTarget))) setActiveDailyRound(null);
                                            }}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setDailyOverwriteRequest(null);
                                                setManualDailySearches((current) => current.map((search, index) => (index === roundIndex ? value : search)));
                                                setManualDailySelections((current) => current.map((selected, index) => (index === roundIndex ? "" : selected)));
                                                setManualDailySearchResults((current) => current.map((results, index) => (index === roundIndex ? [] : results)));
                                                setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? value.trim().length >= 2 : searching)));
                                                setActiveDailyOptionIndices((current) => current.map((selected, index) => (index === roundIndex ? 0 : selected)));
                                                setActiveDailyRound(roundIndex);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === "ArrowDown" && options.length > 0) {
                                                    event.preventDefault();
                                                    setActiveDailyOptionIndices((current) => current.map((value, index) => (index === roundIndex ? Math.min(value + 1, options.length - 1) : value)));
                                                } else if (event.key === "ArrowUp" && options.length > 0) {
                                                    event.preventDefault();
                                                    setActiveDailyOptionIndices((current) => current.map((value, index) => (index === roundIndex ? Math.max(value - 1, 0) : value)));
                                                } else if (event.key === "Enter") {
                                                    event.preventDefault();
                                                    const option = options[activeOptionIndex];
                                                    if (option) selectManualDailyOption(roundIndex, option);
                                                } else if (event.key === "Escape") {
                                                    setActiveDailyRound(null);
                                                }
                                            }}
                                            role="combobox"
                                            aria-label={`Search content for round ${roundIndex + 1}`}
                                            aria-autocomplete="list"
                                            aria-expanded={isOpen}
                                            aria-controls={isOpen ? listboxId : undefined}
                                            aria-activedescendant={isOpen && options[activeOptionIndex] ? `${listboxId}-option-${activeOptionIndex}` : undefined}
                                        />
                                        {isOpen && (
                                            <div
                                                id={listboxId}
                                                role="listbox"
                                                aria-label={`Round ${roundIndex + 1} search results`}
                                                className="motion-scale-in absolute z-50 mt-1 w-full origin-top overflow-hidden border border-border/60 bg-background shadow-lg"
                                            >
                                                <div className="max-h-[min(240px,35dvh)] divide-y divide-border/40 overflow-y-auto">
                                                    {searchingDailyRounds[roundIndex] ? (
                                                        <p className="px-4 py-2.5 text-sm text-muted-foreground" role="status">
                                                            Searching...
                                                        </p>
                                                    ) : options.length > 0 ? (
                                                        options.map((option, optionIndex) => (
                                                            <button
                                                                key={option.id}
                                                                id={`${listboxId}-option-${optionIndex}`}
                                                                type="button"
                                                                role="option"
                                                                aria-selected={optionIndex === activeOptionIndex}
                                                                className={`w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-[background-color,color] ${optionIndex === activeOptionIndex ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary/50"}`}
                                                                onMouseDown={(event) => event.preventDefault()}
                                                                onMouseEnter={() => setActiveDailyOptionIndices((current) => current.map((value, index) => (index === roundIndex ? optionIndex : value)))}
                                                                onClick={() => selectManualDailyOption(roundIndex, option)}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <p className="px-4 py-2.5 text-sm text-muted-foreground">No matches found</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </fieldset>
                <div className="mt-5 flex items-start gap-3">
                    <Switch
                        id="ignore-daily-repetition"
                        checked={ignoreDailyRepetition}
                        onCheckedChange={(checked) => {
                            setDailyOverwriteRequest(null);
                            setIgnoreDailyRepetition(checked);
                        }}
                        disabled={manualDailyMode === "skin" || manualDailyMode === "score_pp"}
                    />
                    <div className="space-y-1">
                        <Label htmlFor="ignore-daily-repetition">Ignore mapset repetition checks</Label>
                        <p className="text-sm leading-6 text-muted-foreground">
                            {manualDailyMode === "score_pp" || manualDailyMode === "skin"
                                ? "Mapset repetition checks do not apply to this mode."
                                : "Allow mapsets used by another game mode on the same day or by this mode during the previous week."}
                        </p>
                    </div>
                </div>
                {dailyOverwriteRequest === dailyChallengeRequest && (
                    <div className="mt-5 border-l-2 border-destructive py-1 pl-4" role="alert">
                        <p className="text-sm font-medium">
                            A {manualDailyMode} challenge is already scheduled for {manualDailyDate}.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">Overwrite it with the five rounds currently selected?</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="destructive" onClick={() => void handleSetManualDaily(true)} disabled={isSaving}>
                                {isSaving ? "Saving..." : "Overwrite challenge"}
                            </Button>
                            <Button variant="outline" onClick={() => setDailyOverwriteRequest(null)} disabled={isSaving}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}
                <Button className="mt-5" onClick={() => void handleSetManualDaily()} disabled={isSaving || !manualDailyDate || !manualDailyDateIso || !hasFiveUniqueDailyItems}>
                    {isSaving ? "Saving..." : "Set daily challenge"}
                </Button>
            </AdminGroup>
        </CollapsibleSection>
    );
}
