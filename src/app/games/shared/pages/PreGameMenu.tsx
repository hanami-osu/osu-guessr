"use client";

import { DAILY_ROUND_TIME } from "@/lib/game/daily";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BASE_POINTS, DAILY_ROUNDS, GAME_MODES, GameVariant, MAX_ROUNDS, ROUND_TIME, SKIP_PENALTY, STREAK_BONUS, SURVIVAL_LIVES, TIME_BONUS_MULTIPLIER, isContinuousVariant } from "@/app/games/config";
import { useTranslationsContext } from "@/context/translations-provider";
import { SectionLabel } from "@/components/page-heading";
import { GameMode, type GameRunType } from "@/actions/types";
import { ChevronDown } from "lucide-react";
import { getDailyStatusAction } from "@/actions/game-server";
import DailyResetCountdown from "@/app/games/shared/components/DailyResetCountdown";
import { readGuestDailyAttempt, writeGuestDailyAttempt } from "@/lib/game/daily-client";

interface PreGameMenuProps {
    onStart(variant: GameVariant, runType?: GameRunType, gameMode?: GameMode): void;
    onCancel(): void;
    gameMode: GameMode;
    dailyModePicker?: boolean;
}

interface DailyStatus {
    attempted: boolean;
    resumable: boolean;
    scoreId: string | null;
    day: number;
    guestSessionId?: string;
}

const dailyStatusCache = new Map<GameMode, DailyStatus>();

function readDailyStatusCache(gameMode: GameMode): DailyStatus | null {
    const memoryStatus = dailyStatusCache.get(gameMode);
    if (memoryStatus) return memoryStatus;
    if (typeof window === "undefined") return null;

    try {
        const cached = window.localStorage.getItem(`osu-guessr:daily-status:${gameMode}`);
        if (!cached) return null;
        const status = JSON.parse(cached) as DailyStatus;
        const today = new Date().toISOString().slice(0, 10);
        if (typeof status.day !== "number" || status.day < 1 || status.day !== Number(window.localStorage.getItem(`osu-guessr:daily-day:${gameMode}`))) return null;
        if (window.localStorage.getItem(`osu-guessr:daily-date:${gameMode}`) !== today) return null;
        dailyStatusCache.set(gameMode, status);
        return status;
    } catch {
        return null;
    }
}

function writeDailyStatusCache(gameMode: GameMode, status: DailyStatus): void {
    dailyStatusCache.set(gameMode, status);
    try {
        const today = new Date().toISOString().slice(0, 10);
        window.localStorage.setItem(`osu-guessr:daily-status:${gameMode}`, JSON.stringify(status));
        window.localStorage.setItem(`osu-guessr:daily-day:${gameMode}`, String(status.day));
        window.localStorage.setItem(`osu-guessr:daily-date:${gameMode}`, today);
    } catch {}
}

export default function PreGameMenu({ onStart, onCancel, gameMode, dailyModePicker = false }: PreGameMenuProps) {
    const { t } = useTranslationsContext();
    const router = useRouter();
    const { data: session, status: authStatus } = useSession();
    const [selectedGameMode, setSelectedGameMode] = useState<GameMode>(gameMode);
    const activeGameMode = dailyModePicker ? selectedGameMode : gameMode;
    const supportsDaily = true;
    const [selectedMode, setSelectedMode] = useState<GameVariant | "daily">(supportsDaily ? "daily" : "classic");
    const [dailyStatus, setDailyStatus] = useState<DailyStatus | null>(null);

    useEffect(() => {
        if (!supportsDaily || authStatus === "loading") return;
        if (!session?.user?.banchoId) {
            const guestAttempt = readGuestDailyAttempt(activeGameMode);
            setDailyStatus({
                attempted: Boolean(guestAttempt),
                resumable: guestAttempt?.status === "started",
                scoreId: null,
                day: Math.floor((Date.now() - Date.UTC(2026, 10, 15)) / 86_400_000) + 1,
                guestSessionId: guestAttempt?.status === "completed" ? guestAttempt.sessionId : undefined,
            });
            return;
        }
        let cancelled = false;
        const cachedStatus = readDailyStatusCache(activeGameMode);
        setDailyStatus(cachedStatus);
        getDailyStatusAction(activeGameMode)
            .then((status) => {
                if (!cancelled) {
                    writeDailyStatusCache(activeGameMode, status);
                    setDailyStatus(status);
                }
            })
            .catch((error) => {
                console.error("Failed to check today's daily challenge:", error);
            });
        return () => {
            cancelled = true;
        };
    }, [activeGameMode, authStatus, session?.user?.banchoId, supportsDaily]);

    const descriptions = t.game.preGame.description as Record<string, string>;
    const gameDescription = descriptions[activeGameMode] || descriptions.background;
    const modeArtwork = GAME_MODES.find((mode) => mode.id === activeGameMode)?.image ?? "/ghostrule.webp";
    const listClass = "space-y-2";
    const listItemClass = "flex items-start gap-2 text-xs leading-5 text-muted-foreground sm:text-sm";
    const markerClass = "mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary/70";

    const ClassicModeContent = () => (
        <section>
            <SectionLabel className="mb-3">{t.game.preGame.howToPlay.title}</SectionLabel>
            <ul className={listClass}>
                {activeGameMode === GameMode.ScorePp && (
                    <li className={listItemClass}>
                        <span aria-hidden="true" className={markerClass} />
                        {t.game.preGame.howToPlay.scorePp.choose}
                    </li>
                )}
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.classic.rounds.replace("{count}", MAX_ROUNDS.toString())}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.classic.time.replace("{seconds}", ROUND_TIME.toString())}
                </li>
            </ul>
        </section>
    );

    const ContinuousModeContent = () => (
        <section>
            <SectionLabel className="mb-3">{t.game.preGame.howToPlay.title}</SectionLabel>
            <ul className={listClass}>
                {activeGameMode === GameMode.ScorePp && (
                    <li className={listItemClass}>
                        <span aria-hidden="true" className={markerClass} />
                        {t.game.preGame.howToPlay.scorePp.choose}
                    </li>
                )}
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {selectedMode === "death" ? t.game.preGame.howToPlay.oneLife.continuous : t.game.preGame.howToPlay.death.continuous}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {selectedMode === "death" ? t.game.preGame.howToPlay.oneLife.lives : t.game.preGame.howToPlay.death.lives.replace("{count}", SURVIVAL_LIVES.toString())}
                </li>
                <li className={listItemClass}>
                    <span aria-hidden="true" className={markerClass} />
                    {t.game.preGame.howToPlay.death.time.replace("{seconds}", ROUND_TIME.toString())}
                </li>
            </ul>
        </section>
    );

    const DailyModeContent = () => (
        <section>
            <SectionLabel className="mb-3">{t.game.preGame.howToPlay.title}</SectionLabel>
            <ul className={listClass}>
                <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{gameDescription}</li>
                <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.howToPlay.daily.rounds.replace("{count}", DAILY_ROUNDS.toString())}</li>
                <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.howToPlay.classic.time.replace("{seconds}", DAILY_ROUND_TIME.toString())}</li>
                <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.howToPlay.daily.seeded}</li>
                {activeGameMode === GameMode.ScorePp && <li className={listItemClass}><span aria-hidden="true" className={markerClass} />{t.game.preGame.howToPlay.scorePp.choose}</li>}
            </ul>
        </section>
    );

    return (
        <div className="overflow-hidden rounded-lg bg-card">
            <div>
                <div className="relative isolate overflow-hidden px-5 pb-4 pt-10 sm:px-6 sm:pb-5 sm:pt-12">
                    <Image src={modeArtwork} alt="" fill priority sizes="(min-width: 896px) 896px, 100vw" className="-z-20 object-cover object-center" />
                    <div aria-hidden="true" className="absolute -inset-px -z-10 bg-gradient-to-t from-card from-5% via-card/85 to-card/40" />
                    <div className="min-w-0 pr-6">
                        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{dailyModePicker ? t.game.daily.title : t.game.preGame.title[activeGameMode as keyof typeof t.game.preGame.title]}</h1>
                        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{dailyModePicker ? t.game.daily.chooseMode : gameDescription}</p>
                    </div>
                </div>

                <section className="relative z-10 bg-card">
                    <div className="grid grid-cols-2 gap-2 px-3 py-2.5 sm:grid-cols-4 sm:px-5" role="radiogroup" aria-label={dailyModePicker ? t.game.preGame.modeLabel : t.game.preGame.variantLabel}>
                        {dailyModePicker ? GAME_MODES.map((mode) => (
                            <button
                                key={mode.id}
                                type="button"
                                role="radio"
                                onClick={() => setSelectedGameMode(mode.id)}
                                className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${activeGameMode === mode.id ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                aria-checked={activeGameMode === mode.id}
                            >
                                <span className="flex min-h-10 items-center text-sm font-semibold">{t.gameModes.modes[mode.id].title}</span>
                            </button>
                        )) : <>
                        {supportsDaily && (
                            <button
                                type="button"
                                role="radio"
                                onClick={() => setSelectedMode("daily")}
                                className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === "daily" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                aria-checked={selectedMode === "daily"}
                            >
                                <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                    <span className="text-sm font-semibold">{t.game.preGame.modes.daily.title}</span>
                                    <span className="text-xs text-muted-foreground">{t.game.preGame.modes.classic.description.replace("{count}", DAILY_ROUNDS.toString())}</span>
                                </span>
                            </button>
                        )}
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("classic")}
                            className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === "classic" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            aria-checked={selectedMode === "classic"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold">{t.game.preGame.modes.classic.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.classic.description.replace("{count}", MAX_ROUNDS.toString())}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("survival")}
                            className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === "survival" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            aria-checked={selectedMode === "survival"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold">{t.game.preGame.modes.death.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.death.description.replace("{count}", SURVIVAL_LIVES.toString())}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            onClick={() => setSelectedMode("death")}
                            className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selectedMode === "death" ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                            aria-checked={selectedMode === "death"}
                        >
                            <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                                <span className="text-sm font-semibold">{t.game.preGame.modes.oneLife.title}</span>
                                <span className="text-xs text-muted-foreground">{t.game.preGame.modes.oneLife.description}</span>
                            </span>
                        </button>
                        </>}
                    </div>
                </section>

                <div className="px-5 py-4 sm:px-6 sm:py-5">
                    {selectedMode === "daily" ? <DailyModeContent /> : isContinuousVariant(selectedMode) ? <ContinuousModeContent /> : <ClassicModeContent />}

                    <details className="group mt-6">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                            <span className="flex items-center gap-2">
                                <SectionLabel className="mb-0">{t.game.preGame.scoring.title}</SectionLabel>
                            </span>
                            <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="pt-3">
                            {selectedMode === "classic" || selectedMode === "daily" ? (
                                <ul className={listClass}>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.classic.base.replace("{points}", BASE_POINTS.toString())}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.classic.timeBonus.replace("{points}", TIME_BONUS_MULTIPLIER.toString())}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.classic.streakBonus.replace("{points}", STREAK_BONUS.toString())}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.classic.pp}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.death.compete}
                                    </li>
                                </ul>
                            ) : (
                                <ul className={listClass}>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.death.score}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.classic.skipPenalty.replace("{points}", SKIP_PENALTY.toString())}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {selectedMode === "death" ? t.game.preGame.scoring.oneLife.streakFirst : t.game.preGame.scoring.death.streakOnly}
                                    </li>
                                    <li className={listItemClass}>
                                        <span aria-hidden="true" className={markerClass} />
                                        {t.game.preGame.scoring.death.compete}
                                    </li>
                                </ul>
                            )}
                        </div>
                    </details>

                    {selectedMode === "daily" && <div className="mt-5 border-t border-border/60 pt-4"><DailyResetCountdown /></div>}

                    {selectedMode === "classic" && (
                        <section className="mt-6">
                            <h2 className="text-xs font-semibold text-foreground">{t.game.preGame.warning.title}</h2>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.game.preGame.warning.description.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                        </section>
                    )}
                </div>

                <div className="border-t border-border/60 px-5 py-4 sm:px-6">
                    <div className="flex gap-2 sm:justify-end">
                        <Button
                            onClick={() => {
                                if (selectedMode === "daily" && dailyStatus?.guestSessionId) {
                                    router.push(`/daily/result/${dailyStatus.guestSessionId}`);
                                } else if (selectedMode === "daily" && dailyStatus?.scoreId) {
                                    router.push(`/scores/${dailyStatus.scoreId}`);
                                } else if (selectedMode === "daily") {
                                    if (!session?.user?.banchoId && !readGuestDailyAttempt(activeGameMode)) writeGuestDailyAttempt(activeGameMode, { status: "started" });
                                    onStart("classic", "daily", dailyModePicker ? activeGameMode : undefined);
                                } else {
                                    onStart(selectedMode, undefined, dailyModePicker ? activeGameMode : undefined);
                                }
                            }}
                            className="h-11 flex-1 px-5 sm:flex-none sm:min-w-36"
                            variant="default"
                            disabled={selectedMode === "daily" && Boolean(dailyStatus?.attempted && !dailyStatus.scoreId && !dailyStatus.resumable && !dailyStatus.guestSessionId)}
                        >
                            {selectedMode === "daily"
                                ? dailyStatus?.guestSessionId
                                    ? t.game.actions.viewResults
                                    : dailyStatus?.scoreId
                                    ? t.game.actions.viewResults
                                                                : dailyStatus?.attempted && dailyStatus.resumable
                                                                    ? t.game.daily.continueChallenge
                                                                    : dailyStatus?.attempted
                                      ? t.game.daily.alreadyPlayed
                                                                            : t.game.preGame.actions.startGame
                                : t.game.preGame.actions.startGame}
                        </Button>
                        <Button type="button" variant="ghost" className="h-11 flex-1 px-4 sm:flex-none" onClick={onCancel}>
                            {t.game.preGame.actions.backToHome}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
