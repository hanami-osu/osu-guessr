"use client";

import { useEffect } from "react";

export function useLeaveGameGuard(enabled: boolean, onLeaveRequest: (href: string) => void) {
    useEffect(() => {
        if (!enabled) return;

        const handleClick = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (!(event.target instanceof Element)) return;

            const anchor = event.target.closest("a[href]");
            if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

            const rawHref = anchor.getAttribute("href");
            if (!rawHref || rawHref.startsWith("#")) return;

            const target = new URL(anchor.href, window.location.href);
            if (target.origin !== window.location.origin) return;

            const current = new URL(window.location.href);
            if (target.pathname === current.pathname && target.search === current.search && target.hash) return;

            event.preventDefault();
            onLeaveRequest(`${target.pathname}${target.search}${target.hash}`);
        };

        document.addEventListener("click", handleClick, true);
        return () => document.removeEventListener("click", handleClick, true);
    }, [enabled, onLeaveRequest]);
}
