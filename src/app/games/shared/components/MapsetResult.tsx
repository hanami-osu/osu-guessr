"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import type { GameMediaProps } from "@/lib/game/types";
import { ResultMessage } from "./Result";

type MapsetResultProps = {
    result: NonNullable<GameMediaProps["result"]>;
    songInfo: NonNullable<GameMediaProps["songInfo"]>;
};

export function MapsetResult({ result, songInfo }: MapsetResultProps) {
    const { t } = useTranslationsContext();

    return (
        <>
            <ResultMessage result={result} />
            <div className="space-y-2">
                <p className="text-lg font-semibold break-words">{songInfo.title}</p>
                <p className="text-foreground/70">{t.game.media.by} {songInfo.artist}</p>
                <p className="text-sm text-muted-foreground">{t.game.media.mappedBy} {songInfo.mapper}</p>
                {songInfo.mapsetId && (
                    <a href={`https://osu.ppy.sh/beatmapsets/${songInfo.mapsetId}`} className="inline-block mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors" target="_blank" rel="noopener noreferrer">
                        {t.game.media.viewBeatmap}
                    </a>
                )}
            </div>
        </>
    );
}
