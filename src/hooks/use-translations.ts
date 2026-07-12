"use client";

import { useState, useEffect } from "react";
import { getTranslations, isLocale, Locale } from "@/lib/translations";

export { languages } from "@/lib/translations";
export type { Locale, Translations } from "@/lib/translations";

export function useTranslations(initialLocale: Locale = "en", migrateStoredLocale = false) {
    const [locale, setLocale] = useState<Locale>(initialLocale);

    useEffect(() => {
        const stored = localStorage.getItem("locale");
        if (migrateStoredLocale && isLocale(stored)) {
            document.cookie = `locale=${stored}; path=/; max-age=31536000; samesite=lax`;
            document.documentElement.lang = stored;

            if (stored !== locale) {
                setLocale(stored);
                return;
            }
        }

        document.documentElement.lang = locale;
    }, [locale, migrateStoredLocale]);

    const setLanguage = (newLocale: Locale) => {
        localStorage.setItem("locale", newLocale);
        document.cookie = `locale=${newLocale}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = newLocale;
        setLocale(newLocale);
    };

    return {
        t: getTranslations(locale),
        locale,
        setLanguage,
    };
}
