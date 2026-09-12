"use client";

import Image from "next/image";
import { MapsetResult } from "../../shared/components/MapsetResult";
import type { GameMediaProps } from "@/lib/game/types";
import { useTranslationsContext } from "@/context/translations-provider";

export default function GameImage({ mediaUrl, isRevealed, result, songInfo }: GameMediaProps) {
    const { t } = useTranslationsContext();

    return (
        <div className="relative aspect-video max-h-[42dvh] overflow-hidden">
            <Image src={mediaUrl || "/placeholder.svg"} alt={t.game.media.backgroundAlt} fill className="object-contain" />
            {isRevealed && result && songInfo && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 p-4 text-center backdrop-blur-sm">
                    <MapsetResult result={result} songInfo={songInfo} />
                </div>
            )}
        </div>
    );
}
