"use client";

import Image from "next/image";
import { ResultMessage } from "../../shared/components/Result";
import type { GameMediaProps } from "@/lib/game/types";
import { useTranslationsContext } from "@/context/translations-provider";

export default function GameSkin({ mediaUrl, isRevealed, result, songInfo }: GameMediaProps) {
    const { t } = useTranslationsContext();

    return (
        <div className="relative overflow-hidden">
            <div className="aspect-video">
                <Image src={mediaUrl || "/placeholder.svg"} alt={t.game.media.skinAlt} fill className="object-contain" priority />
            </div>

            {isRevealed && result && songInfo && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <ResultMessage result={result} />
                    <div className="space-y-2">
                        <p className="text-xl font-semibold">{t.game.media.skinName.replace("{name}", songInfo.title || t.game.media.unknown)}</p>
                        {songInfo.mapsetId && (
                            <a
                                href={`https://skins.osuck.net/skins/${songInfo.mapsetId}`}
                                className="inline-block mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {t.game.media.viewSkin}
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
