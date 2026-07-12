"use client";

import { Loader2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { ResultMessage } from "../../shared/components/Result";
import { useTranslationsContext } from "@/context/translations-provider";
import { GameMediaProps } from "@/lib/game/interfaces";
import { Button } from "@/components/ui/button";

export default function GameAudio({ mediaUrl, isRevealed, result, songInfo, onVolumeChange, initialVolume }: GameMediaProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mediaError, setMediaError] = useState<string | null>(null);
    const { t } = useTranslationsContext();

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsLoading(true);
            setMediaError(null);

            const handleCanPlay = () => {
                window.clearTimeout(loadTimeout);
                setIsLoading(false);
                if (!isRevealed) {
                    const playPromise = audioRef.current!.play();
                    if (playPromise !== undefined) {
                        playPromise.catch((error: unknown) => {
                            console.log("Audio playback failed:", error);
                            setIsLoading(false);
                            setMediaError(t.game.audio.loadFailed);
                        });
                    }
                }
            };

            const handleError = () => {
                window.clearTimeout(loadTimeout);
                setIsLoading(false);
                setMediaError(t.game.audio.loadFailed);
            };

            const loadTimeout = window.setTimeout(handleError, 15000);

            const audio = audioRef.current; // Copy ref to variable
            audio.addEventListener("canplay", handleCanPlay);
            audio.addEventListener("error", handleError);
            audio.load();

            return () => {
                audio.removeEventListener("canplay", handleCanPlay);
                audio.removeEventListener("error", handleError);
                window.clearTimeout(loadTimeout);
                audio.pause();
                audio.currentTime = 0;
            };
        }
    }, [mediaUrl, isRevealed, t.game.audio.loadFailed]);

    const retryAudio = () => {
        setMediaError(null);
        setIsLoading(true);
        audioRef.current?.load();
    };

    useEffect(() => {
        if (audioRef.current && initialVolume !== undefined) {
            audioRef.current.volume = initialVolume;
        }
    }, [initialVolume]);

    useEffect(() => {
        if (audioRef.current && onVolumeChange) {
            const audio = audioRef.current; // Copy ref to variable
            const handleVolumeChange = () => {
                onVolumeChange(audio.volume);
            };
            audio.addEventListener("volumechange", handleVolumeChange);

            return () => {
                audio.removeEventListener("volumechange", handleVolumeChange);
            };
        }
    }, [onVolumeChange]);

    useEffect(() => {
        if (isRevealed && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }, [isRevealed]);

    return (
        <div className="relative bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-6">
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
                <div className="bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <ResultMessage result={result} />
                    <div className="space-y-2">
                        <p className="text-xl font-semibold">{songInfo.title}</p>
                        <p className="text-foreground/70">by {songInfo.artist}</p>
                        <p className="text-sm text-foreground/50">Mapped by {songInfo.mapper}</p>
                        {songInfo.mapsetId && (
                            <a
                                href={`https://osu.ppy.sh/beatmapsets/${songInfo.mapsetId}`}
                                className="inline-block mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View Beatmap
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
