"use client";

import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Check, Globe } from "lucide-react";
import { languages, Locale } from "@/hooks/use-translations";
import { useTranslationsContext } from "@/context/translations-provider";

export function LanguageSwitcher() {
    const { locale, setLanguage, t } = useTranslationsContext();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t.components.header.accessibility.changeLanguage}>
                    <Globe className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="space-y-2" align="end" aria-label={t.components.header.accessibility.changeLanguage}>
                {Object.entries(languages).map(([code, name]) => (
                    <DropdownMenuItem key={code} role="menuitemradio" aria-checked={locale === code} onClick={() => setLanguage(code as Locale)} className={`${locale === code ? "bg-accent" : ""} hover:cursor-pointer`}>
                        <Check className={`mr-2 h-4 w-4 ${locale === code ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                        {name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
