"use client";

import { useEffect } from "react";

interface GameKeyboardShortcuts {
    disabled: boolean;
    onNextRound?: () => void;
    onSkip?: () => void;
}

export function useGameKeyboardShortcuts({ disabled, onNextRound, onSkip }: GameKeyboardShortcuts) {
    useEffect(() => {
        if (disabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat || event.defaultPrevented || event.isComposing) return;
            if (document.querySelector('[role="dialog"][data-state="open"]')) return;

            const target = event.target;
            if (
                target instanceof HTMLElement &&
                target.closest("button, a[href], input, textarea, select, summary, [contenteditable='true'], [role='button'], [role='link'], [role='menuitem'], [role='option']")
            ) return;

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && onSkip) {
                event.preventDefault();
                onSkip();
                return;
            }

            if (event.key === "Enter") onNextRound?.();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [disabled, onNextRound, onSkip]);
}
