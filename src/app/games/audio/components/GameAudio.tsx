"use client";

import { Headphones, Loader2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { MapsetResult } from "../../shared/components/MapsetResult";
import { useTranslationsContext } from "@/context/translations-provider";
import type { GameMediaProps } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { AUDIO_AUTOPLAY_STORAGE_KEY, DEFAULT_AUDIO_AUTOPLAY, DEFAULT_AUDIO_VOLUME_PERCENT, readAudioVolumePreference, readBooleanPreference } from "@/lib/game/preferences";

export default function GameAudio({ mediaUrl, isRevealed, result, songInfo }: GameMediaProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const isRevealedRef = useRef(isRevealed);
    const { t } = useTranslationsContext();
    isRevealedRef.current = isRevealed;

    useEffect(() => {
        if (!audioRef.current) return;

        try {
            audioRef.current.volume = readAudioVolumePreference(window.localStorage) / 100;
        } catch {
            audioRef.current.volume = DEFAULT_AUDIO_VOLUME_PERCENT / 100;
        }
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        let cancelled = false;
        audio.pause();
        audio.currentTime = 0;
        setIsLoading(true);
        setMediaError(null);

        const handleError = () => {
            if (cancelled) return;
            window.clearTimeout(loadTimeout);
            setIsLoading(false);
            setMediaError(t.game.audio.loadFailed);
        };

        const handleCanPlay = () => {
            if (cancelled) return;
            window.clearTimeout(loadTimeout);
            setIsLoading(false);
            if (isRevealedRef.current) return;

            try {
                if (!readBooleanPreference(window.localStorage, AUDIO_AUTOPLAY_STORAGE_KEY, DEFAULT_AUDIO_AUTOPLAY)) return;
            } catch {}

            void audio.play().catch((error: unknown) => {
                if (cancelled || (error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError"))) return;
                setMediaError(t.game.audio.loadFailed);
            });
        };

        const loadTimeout = window.setTimeout(handleError, 15000);
        audio.addEventListener("canplay", handleCanPlay, { once: true });
        audio.addEventListener("error", handleError);
        audio.load();

        return () => {
            cancelled = true;
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("error", handleError);
            window.clearTimeout(loadTimeout);
            audio.pause();
            audio.currentTime = 0;
        };
    }, [loadAttempt, mediaUrl, t.game.audio.loadFailed]);

    const retryAudio = () => {
        setMediaError(null);
        setIsLoading(true);
        setLoadAttempt((attempt) => attempt + 1);
    };

    useEffect(() => {
        if (isRevealed && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }, [isRevealed]);

    return (
        <div className="relative flex min-h-56 flex-col justify-center overflow-hidden md:min-h-72">
            <div className={isRevealed ? "px-5 pt-4" : "p-5"}>
                {!isRevealed && <Headphones aria-hidden="true" className="mx-auto mb-5 h-10 w-10 text-primary" />}
                {isLoading && (
                    <div className="flex justify-center items-center h-[50px] mb-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                )}
                {mediaError && (
                    <div role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-center">
                        <p className="mb-3 text-sm text-destructive">{mediaError}</p>
                        <Button type="button" size="sm" variant="outline" onClick={retryAudio}>
                            {t.game.audio.retry}
                        </Button>
                    </div>
                )}
                <audio ref={audioRef} controls className={`w-full mb-4 ${isLoading || mediaError ? "hidden" : "block"}`}>
                    <source src={mediaUrl} />
                    {t.game.audio.browserNotSupported}
                </audio>
                {!isRevealed && <p className="text-center text-muted-foreground">{t.game.audio.instructions}</p>}
            </div>
            {isRevealed && result && songInfo && (
                <div className="bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center px-5 pb-5 text-center">
                    <MapsetResult result={result} songInfo={songInfo} />
                </div>
            )}
        </div>
    );
}
