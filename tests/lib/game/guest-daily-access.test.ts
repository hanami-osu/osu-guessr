import { describe, expect, test } from "bun:test";
import { createGuestDailyAccessToken, getGuestDailyCookieName, hasGuestDailyAccess } from "@/lib/game/guest-daily-access";

describe("guest daily result access", () => {
    test("binds access tokens to the exact guest session", () => {
        const sessionId = "00000000-0000-4000-8000-000000000000";
        const token = createGuestDailyAccessToken(sessionId);

        expect(getGuestDailyCookieName(sessionId)).toBe(`osu-guessr.guest-daily.${sessionId}`);
        expect(hasGuestDailyAccess(sessionId, token)).toBe(true);
        expect(hasGuestDailyAccess("00000000-0000-4000-8000-000000000001", token)).toBe(false);
        expect(hasGuestDailyAccess(sessionId, `${sessionId}.invalid`)).toBe(false);
        expect(hasGuestDailyAccess(sessionId, undefined)).toBe(false);
    });
});