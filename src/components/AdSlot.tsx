"use client";

import React, { useEffect, useRef } from "react";

type AdSlotProps = {
    adSlot?: string;
    adClient?: string;
    compact?: boolean;
};

export default function AdSlot({ adSlot, adClient, compact = false }: AdSlotProps) {
    const ref = useRef<HTMLDivElement | null>(null);

    const client = adClient ?? process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-3511683752810096";
    const slot = adSlot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT;

    type AdsByGoogleWindow = Window & { adsbygoogle?: Array<Record<string, unknown>> };

    useEffect(() => {
        if (!slot) return;

        let cancelled = false;
        let attempts = 0;

        const tryPush = () => {
            try {
                const w = window as AdsByGoogleWindow;
                w.adsbygoogle = w.adsbygoogle || [];
                w.adsbygoogle.push({});
            } catch {
                attempts += 1;
                if (!cancelled && attempts < 6) {
                    setTimeout(tryPush, 1000 * attempts);
                }
            }
        };

        const t = setTimeout(tryPush, 0);

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [slot, client]);

    if (!slot) {
        if (process.env.NODE_ENV !== "production") {
            console.warn("AdSlot: no ad slot configured. Set NEXT_PUBLIC_ADSENSE_SLOT or pass adSlot prop to render ads.");
        }
        return null;
    }

    return (
        <div className={compact ? "flex min-h-12 justify-center py-3" : "my-4 flex justify-center"} ref={ref} role="complementary" aria-label="Advertisement">
            <ins className="adsbygoogle w-full" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot} data-ad-format={compact ? "horizontal" : "auto"} data-full-width-responsive="true" />
        </div>
    );
}
