"use client";

import type { GameMediaProps } from "@/lib/game/types";
import { useTranslationsContext } from "@/context/translations-provider";

export const ResultMessage = ({ result }: { result: GameMediaProps["result"] }) => {
    const { t } = useTranslationsContext();

    if (!result) return null;

    let message = "";
    let colorClass = "";

    switch (result.type) {
        case "guess":
            if (result.correct) {
                message = t.game.result.correct;
                colorClass = "text-green-500";
            } else {
                message = t.game.result.wrong;
                colorClass = "text-destructive";
            }
            break;
        case "skip":
            message = t.game.result.skipped;
            colorClass = "text-yellow-500";
            break;
        case "timeout":
            message = t.game.result.timeout;
            colorClass = "text-destructive";
            break;
    }

    return (
        <div className={`text-2xl font-bold mb-4 ${colorClass}`} role="status" aria-live="polite">
            {message}
        </div>
    );
};
