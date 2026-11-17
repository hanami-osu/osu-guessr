"use client";

import { useState, useEffect } from "react";
import type { Translations } from "@/lib/translations";
import { useTranslationsContext } from "@/context/translations-provider";
import { AtSign, Gamepad2, Heart, MessagesSquare, type LucideIcon } from "lucide-react";

interface LinkPromo {
    id: string;
    title: string;
    link: string;
}

const promoIcons: Record<string, LucideIcon> = {
    twitter: AtSign,
    osu: Gamepad2,
    buymeacoffe: Heart,
    discord: MessagesSquare,
};

const createPromos = (t: Translations): Array<LinkPromo> => [
    {
        id: "twitter",
        title: t.components.ads.twitter.title,
        link: "https://twitter.com/_yorunoken",
    },
    {
        id: "osu",
        title: t.components.ads.osu.title,
        link: "https://osu.ppy.sh/users/yorunoken",
    },
    {
        id: "buymeacoffe",
        title: t.components.ads.buymeacoffe.title,
        link: "/support",
    },
    {
        id: "discord",
        title: t.components.ads.discord.title,
        link: "https://discord.gg/qrud2g4CA5",
    },
];

export function AdSlider({ compact = false }: { compact?: boolean }) {
    const { t } = useTranslationsContext();
    const promos = createPromos(t);
    const [sequence, setSequence] = useState(() => shuffle([...Array(promos.length).keys()]));
    const [sequenceIndex, setSequenceIndex] = useState(0);

    function shuffle(array: number[]): number[] {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    useEffect(() => {
        const timer = setInterval(() => {
            setSequenceIndex((current) => {
                if (current >= sequence.length - 1) {
                    setSequence(shuffle([...Array(promos.length).keys()]));
                    return 0;
                }
                return current + 1;
            });
        }, 30 * 1000);

        return () => clearInterval(timer);
    }, [promos.length, sequence.length]);

    const currentPromo = promos[sequence[sequenceIndex]];

    return (
        <div className={compact ? "mt-5 text-xs text-muted-foreground" : "max-w-md mx-auto my-8"}>
            <div className="h-full">
                <a
                    href={currentPromo.link}
                    {...(currentPromo.link.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                    className={`block h-full ${compact ? "py-3" : "p-4"} hover:opacity-80 transition-opacity`}
                >
                    <div className={`flex items-center justify-center text-center h-full ${compact ? "gap-2" : "flex-col gap-3"}`}>
                        {(() => {
                            const Icon = promoIcons[currentPromo.id];
                            return Icon ? <Icon aria-hidden="true" className={compact ? "size-4" : "size-7"} /> : null;
                        })()}
                        <div>
                            <h3 className="font-medium">{currentPromo.title}</h3>
                        </div>
                    </div>
                </a>
            </div>
        </div>
    );
}
