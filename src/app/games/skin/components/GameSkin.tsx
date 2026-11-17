"use client";

import Image from "next/image";
import { ResultMessage } from "@/app/games/shared/components/Result";
import MediaReveal from "@/app/games/shared/components/MediaReveal";
import type { GameMediaProps } from "@/lib/game/types";
import { useTranslationsContext } from "@/context/translations-provider";
import { Button } from "@/components/ui/button";

export default function GameSkin({ mediaUrl, isRevealed, result, songInfo }: GameMediaProps) {
    const { t } = useTranslationsContext();

    return (
        <div className="relative aspect-video max-h-[42dvh] overflow-hidden">
            <Image src={mediaUrl || "/placeholder.svg"} alt={t.game.media.skinAlt} fill className="object-contain" priority />

            {isRevealed && result && songInfo && (
                <MediaReveal>
                    <ResultMessage result={result} />
                    <div className="space-y-2">
                        <p className="font-display text-xl font-semibold">{t.game.media.skinName.replace("{name}", songInfo.title || t.game.media.unknown)}</p>
                        {songInfo.mapsetId && (
                            <Button asChild className="mt-2">
                                <a href={`https://skins.osuck.net/skins/${songInfo.mapsetId}`} target="_blank" rel="noopener noreferrer">
                                    {t.game.media.viewSkin}
                                </a>
                            </Button>
                        )}
                    </div>
                </MediaReveal>
            )}
        </div>
    );
}
