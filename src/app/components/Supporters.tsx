"use client";

import { SupportPageLink } from "@/components/SupportDialogWrapper";
import { supporters } from "@/config/supporters";
import { useTranslationsContext } from "@/context/translations-provider";

export function SupportersSection() {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto max-w-6xl px-4">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-center text-2xl font-bold">{t.home.supporters.title}</h2>
                <SupportPageLink />
            </div>

            {supporters.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {supporters.map((supporter, index) => (
                        <div key={index} className="border-t border-border py-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="font-semibold">
                                    {supporter.url ? (
                                        <a href={supporter.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                                            {supporter.name}
                                        </a>
                                    ) : (
                                        supporter.name
                                    )}
                                </div>
                                <div className="text-sm text-primary">${supporter.amount}</div>
                            </div>
                            {supporter.message && (
                                <p className="text-sm text-foreground/70 italic">
                                    {'"'}
                                    {supporter.message}
                                    {'"'}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-foreground/70">
                    <p>{t.home.supporters.beFirst}</p>
                </div>
            )}
        </div>
    );
}
