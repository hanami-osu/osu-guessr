"use client";

import Image from "next/image";
import { MapsetResult } from "@/app/games/shared/components/MapsetResult";
import MediaReveal from "@/app/games/shared/components/MediaReveal";
import type { GameMediaProps } from "@/lib/game/types";
import { useTranslationsContext } from "@/context/translations-provider";

export default function GameImage({ mediaUrl, isRevealed, result, songInfo }: GameMediaProps) {
    const { t } = useTranslationsContext();

    return (
        <div className="relative aspect-video max-h-[42dvh] overflow-hidden">
            <Image src={mediaUrl || "/placeholder.svg"} alt={t.game.media.backgroundAlt} fill className="object-contain" />
            {isRevealed && result && songInfo && (
                <MediaReveal>
                    <MapsetResult result={result} songInfo={songInfo} />
                </MediaReveal>
            )}
        </div>
    );
}
