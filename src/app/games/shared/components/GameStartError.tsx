"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTranslationsContext } from "@/context/translations-provider";

export default function GameStartError({ message, onRetry }: { message: string; onRetry: () => void }) {
    const { t } = useTranslationsContext();

    return (
        <div className="page-container flex min-h-[420px] items-center justify-center py-10">
            <Alert variant="destructive" className="max-w-lg">
                <AlertCircle className="size-4" />
                <AlertTitle>{t.game.errors.startFailed}</AlertTitle>
                <AlertDescription className="mt-2 space-y-4">
                    <p>{message}</p>
                    <Button type="button" variant="outline" onClick={onRetry}>{t.game.actions.retry}</Button>
                </AlertDescription>
            </Alert>
        </div>
    );
}
