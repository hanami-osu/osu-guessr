"use client";

import { useState, useEffect } from "react";
import type { Translations } from "@/lib/translations";
import { useTranslationsContext } from "@/context/translations-provider";

interface Promo {
    id: string;
    title: string;
    link: string;
    icon?: string;
}

const createPromos = (t: Translations): Array<Promo> => [
    {
        id: "twitter",
        title: t.components.ads.twitter.title,
        link: "https://twitter.com/_yorunoken",
        icon: "🐦",
    },
    {
        id: "osu",
        title: t.components.ads.osu.title,
        link: "https://osu.ppy.sh/users/yorunoken",
        icon: "🎮",
    },
    {
        id: "buymeacoffe",
        title: t.components.ads.buymeacoffe.title,
        link: "https://ko-fi.com/yorunoken",
        icon: "☕",
    },
    {
        id: "discord",
        title: t.components.ads.discord.title,
        link: "https://discord.gg/qrud2g4CA5",
        icon: "👾",
    },
];

export function AdSlider() {
    const { t } = useTranslationsContext();
    const promos = createPromos(t);
    const [currentIndex, setCurrentIndex] = useState(0);
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

    useEffect(() => {
        setCurrentIndex(sequence[sequenceIndex]);
    }, [sequenceIndex, sequence]);

    return (
        <div className="max-w-md mx-auto border-t border-border/60 my-8">
            <div className="h-full">
                <a href={promos[currentIndex].link} target="_blank" rel="noopener noreferrer" className="block h-full p-4 hover:opacity-80 transition-opacity">
                    <div className="flex flex-col items-center justify-center text-center gap-3 h-full">
                        {promos[currentIndex].icon && <span className="text-2xl">{promos[currentIndex].icon}</span>}
                        <div>
                            <h3 className="font-medium">{promos[currentIndex].title}</h3>
                        </div>
                    </div>
                </a>
            </div>
        </div>
    );
}
