import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/infra/env";
import { cookies } from "next/headers";

const GUEST_DAILY_COOKIE_PREFIX = "osu-guessr.guest-daily.";

export function getGuestDailyCookieName(sessionId: string): string {
    return `${GUEST_DAILY_COOKIE_PREFIX}${sessionId}`;
}

export function createGuestDailyAccessToken(sessionId: string): string {
    const signature = createHmac("sha256", env.AUTH_SECRET).update(sessionId).digest("base64url");
    return `${sessionId}.${signature}`;
}

export function hasGuestDailyAccess(sessionId: string, token: string | undefined): boolean {
    if (!token) return false;
    const separator = token.lastIndexOf(".");
    if (separator <= 0 || token.slice(0, separator) !== sessionId) return false;

    const providedSignature = token.slice(separator + 1);
    const expectedSignature = createGuestDailyAccessToken(sessionId).slice(sessionId.length + 1);
    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function requireGuestDailySessionAccess(sessionId: string): Promise<void> {
    const store = await cookies();
    if (!hasGuestDailyAccess(sessionId, store.get(getGuestDailyCookieName(sessionId))?.value)) throw new Error("Game session not found or expired");
}

export async function setGuestDailySessionAccess(sessionId: string): Promise<void> {
    const store = await cookies();
    store.set(getGuestDailyCookieName(sessionId), createGuestDailyAccessToken(sessionId), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 24 * 60 * 60,
    });
}
