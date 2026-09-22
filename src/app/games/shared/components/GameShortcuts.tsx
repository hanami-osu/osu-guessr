import { useEffect, useState } from "react";
import { useTranslationsContext } from "@/context/translations-provider";
import { SHORTCUTS_STORAGE_KEY } from "@/lib/game/preferences";

export default function GameShortcuts({ hasSuggestions = false }: { hasSuggestions?: boolean }) {
    const { t } = useTranslationsContext();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        try {
            setOpen(window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) === "true");
        } catch {}
    }, []);

    return (
        <details
            open={open}
            onToggle={(event) => {
                const expanded = event.currentTarget.open;
                setOpen(expanded);
                try {
                    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, String(expanded));
                } catch {}
            }}
            className="border-border/60 pt-3 text-xs text-muted-foreground"
        >
            <summary className="w-fit cursor-pointer py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{t.game.shortcuts.title}</summary>
            <div className="mt-2 space-y-2 leading-relaxed">
                <p>{t.game.shortcuts.items.enter}</p>
                <p>{t.game.shortcuts.items.ctrlS}</p>
                {hasSuggestions && (
                    <>
                        <p>{t.game.shortcuts.items.arrows}</p>
                        <p>{t.game.shortcuts.items.esc}</p>
                    </>
                )}
            </div>
        </details>
    );
}
