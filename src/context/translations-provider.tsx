"use client";

import { createContext, useContext } from "react";
import { Locale, useTranslations } from "@/hooks/use-translations";

const TranslationsContext = createContext<ReturnType<typeof useTranslations> | null>(null);

export function TranslationsProvider({ children, initialLocale, migrateStoredLocale = false }: { children: React.ReactNode; initialLocale: Locale; migrateStoredLocale?: boolean }) {
    const translations = useTranslations(initialLocale, migrateStoredLocale);

    return <TranslationsContext.Provider value={translations}>{children}</TranslationsContext.Provider>;
}

export function useTranslationsContext() {
    const context = useContext(TranslationsContext);
    if (!context) {
        throw new Error("useTranslationsContext must be used within a TranslationsProvider");
    }
    return context;
}
