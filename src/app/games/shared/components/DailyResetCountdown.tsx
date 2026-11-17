"use client";

import { useEffect, useState } from "react";
import { getDailyChallengeInfoAction } from "@/actions/game-server";
import { useTranslationsContext } from "@/context/translations-provider";

function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

export default function DailyResetCountdown() {
    const { t } = useTranslationsContext();
    const [remaining, setRemaining] = useState<number | null>(null);

    useEffect(() => {
        let disposed = false;
        let anchor = 0;
        let serverNow = 0;
        let resetAt = 0;

        const syncWithServer = async () => {
            try {
                const info = await getDailyChallengeInfoAction();
                if (disposed) return;
                anchor = performance.now();
                serverNow = info.serverNow;
                resetAt = info.resetAt;
                setRemaining(Math.max(0, resetAt - serverNow));
            } catch (error) {
                console.error("Failed to get daily reset time:", error);
            }
        };

        void syncWithServer();
        const interval = window.setInterval(() => {
            if (!resetAt) return;
            const nextRemaining = Math.max(0, resetAt - (serverNow + performance.now() - anchor));
            setRemaining(nextRemaining);
            if (nextRemaining === 0) void syncWithServer();
        }, 1000);

        return () => {
            disposed = true;
            window.clearInterval(interval);
        };
    }, []);

    const time = remaining === null ? "--:--:--" : formatDuration(remaining);
    return <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{t.game.daily.resetIn.replace("{time}", time)}</p>;
}