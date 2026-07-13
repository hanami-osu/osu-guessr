import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import cs from "@/messages/cs.json";
import es from "@/messages/es.json";
import pl from "@/messages/pl.json";
import ru from "@/messages/ru.json";

export const languages = {
    en: "English",
    tr: "Türkçe",
    cs: "Čeština",
    es: "Español",
    pl: "Polski",
    ru: "Русский",
} as const;

const messages = { en, tr, cs, es, pl, ru } as const;
export type Locale = keyof typeof messages;
export type Translations = typeof en;

export function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && Object.hasOwn(messages, value);
}

function processMessage(message: string) {
    return message
        .replace(/\{osu_guessr\}/g, "osu!guessr")
        .replace(/\{osu_base\}/g, "osu!")
        .replace(/\{artist_name\}/g, "Triantafyllia");
}

/* eslint-disable  @typescript-eslint/no-explicit-any */
function processTranslations(obj: any, fallback: any = messages.en): any {
    return new Proxy(
        {},
        {
            get(_, prop) {
                const value = obj[prop] ?? fallback[prop];

                if (typeof value === "string") {
                    return processMessage(value);
                }
                if (typeof value === "object" && value !== null) {
                    return processTranslations(obj[prop] || {}, fallback[prop]);
                }
                return value;
            },
            ownKeys() {
                return [...new Set([...Object.keys(obj), ...Object.keys(fallback)])];
            },
            getOwnPropertyDescriptor() {
                return {
                    enumerable: true,
                    configurable: true,
                };
            },
        }
    );
}

export function getTranslations(locale: Locale): Translations {
    return processTranslations(messages[locale]) as Translations;
}
