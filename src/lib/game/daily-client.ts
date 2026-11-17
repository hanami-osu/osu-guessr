import type { GameMode } from "@/actions/types";

export interface GuestDailyAttempt {
    status: "started" | "completed";
    sessionId?: string;
}

export function shouldAutoClaimGuestDailyResult(sessionStatus: string, hasAuthenticatedUser: boolean, saveRequested: boolean): boolean {
    return sessionStatus === "authenticated" && hasAuthenticatedUser && saveRequested;
}

export function guestDailyKey(gameMode: GameMode, date = new Date()): string {
    const dateKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
    return `osu-guessr:guest-daily:${dateKey}:${gameMode}`;
}

export function readGuestDailyAttempt(gameMode: GameMode): GuestDailyAttempt | null {
    try {
        const value = window.localStorage.getItem(guestDailyKey(gameMode));
        if (!value) return null;
        const attempt = JSON.parse(value) as GuestDailyAttempt;
        return attempt.status === "started" || attempt.status === "completed" ? attempt : null;
    } catch {
        return null;
    }
}

export function writeGuestDailyAttempt(gameMode: GameMode, attempt: GuestDailyAttempt): void {
    try {
        window.localStorage.setItem(guestDailyKey(gameMode), JSON.stringify(attempt));
    } catch (error) {
        console.warn("Could not save this browser's daily challenge status:", error);
    }
}


export async function preloadDailyMedia(urls: string[], audio: boolean): Promise<void> {
    await Promise.all(urls.map(url => new Promise<void>((resolve, reject) => {
        if (audio) {
            const media = document.createElement("audio");
            media.preload = "auto";
            media.oncanplaythrough = () => resolve();
            media.onerror = () => reject(new Error("Daily audio could not be loaded"));
            media.src = url;
            media.load();
        } else {
            const media = new Image();
            media.onload = () => resolve();
            media.onerror = () => reject(new Error("Daily image could not be loaded"));
            media.src = url;
        }
    })));
}
