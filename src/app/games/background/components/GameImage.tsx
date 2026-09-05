"use client";

import Image from "next/image";
import { MapsetResult } from "../../shared/components/MapsetResult";
import type { GameMediaProps } from "@/lib/game/types";
import { useTranslationsContext } from "@/context/translations-provider";

export default function GameImage({ mediaUrl, isRevealed, result, songInfo }: GameMediaProps) {
    const { t } = useTranslationsContext();

    return (
        <div className="relative bg-card border border-border rounded-lg overflow-hidden">
            <div className="aspect-video">
                <Image src={mediaUrl || "/placeholder.svg"} alt={t.game.media.backgroundAlt} fill className="object-cover" />
            </div>
            {isRevealed && result && songInfo && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <MapsetResult result={result} songInfo={songInfo} />
                </div>
            )}
        </div>
    );
}
