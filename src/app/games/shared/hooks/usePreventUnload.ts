"use client";

import { useEffect } from "react";

export function usePreventUnload(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [enabled]);
}
