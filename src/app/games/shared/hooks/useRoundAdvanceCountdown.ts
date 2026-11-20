import { type RefObject, useEffect, useRef } from "react";
import { AUTO_ADVANCE_DELAY_MS } from "@/app/games/config";

interface RoundAdvanceCountdownOptions {
    enabled: boolean;
    isDaily: boolean;
    multiplayerRoundKey?: string;
    pausedRef: RefObject<boolean>;
    onAdvance: () => void | Promise<void>;
    setSeconds: (seconds: number) => void;
}

export function useRoundAdvanceCountdown({ enabled, isDaily, multiplayerRoundKey, pausedRef, onAdvance, setSeconds }: RoundAdvanceCountdownOptions): void {
    const multiplayerDeadline = useRef<{ key: string; at: number } | null>(null);

    useEffect(() => {
        if (!enabled) return;

        if (multiplayerRoundKey) {
            if (multiplayerDeadline.current?.key !== multiplayerRoundKey) {
                multiplayerDeadline.current = { key: multiplayerRoundKey, at: Date.now() + AUTO_ADVANCE_DELAY_MS };
            }

            const { at } = multiplayerDeadline.current;
            const updateCountdown = () => setSeconds(Math.max(0, Math.ceil((at - Date.now()) / 1000)));
            updateCountdown();
            const tick = window.setInterval(updateCountdown, 250);
            const advance = window.setTimeout(() => void onAdvance(), Math.max(0, at - Date.now()));
            return () => {
                window.clearInterval(tick);
                window.clearTimeout(advance);
            };
        }

        let elapsed = 0;
        let lastTick = performance.now();
        setSeconds(AUTO_ADVANCE_DELAY_MS / 1000);
        const tick = window.setInterval(() => {
            const now = performance.now();
            const delta = now - lastTick;
            lastTick = now;
            if (!isDaily && pausedRef.current) return;

            elapsed += delta;
            setSeconds(Math.max(0, Math.ceil((AUTO_ADVANCE_DELAY_MS - elapsed) / 1000)));
            if (elapsed >= AUTO_ADVANCE_DELAY_MS) {
                window.clearInterval(tick);
                void onAdvance();
            }
        }, 250);
        return () => window.clearInterval(tick);
    }, [enabled, isDaily, multiplayerRoundKey, onAdvance, pausedRef, setSeconds]);
}
