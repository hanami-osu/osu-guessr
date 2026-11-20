import { beforeEach, expect, mock, test } from "bun:test";

const sessionId = "00000000-0000-4000-8000-000000000003";
const cookieValues = new Map<string, string>();
const guestResult = mock(async () => ({ sessionId }));
mock.module("next/headers", () => ({ cookies: async () => ({
    get: (name: string) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
    set: (name: string, value: string) => cookieValues.set(name, value),
}) }));
mock.module("@/actions/server", () => ({ authenticatedAction: async () => { throw new Error("Unauthorized"); } }));
mock.module("@/lib/game/server", () => ({ getGuestDailyResult: guestResult }));
mock.module("@/lib/score-pp/server", () => ({
    startScorePpRunForUser: async () => sessionId,
    getScorePpRoundForUser: async () => ({}), resumeScorePpRunForUser: async () => ({}),
    endScorePpRunForUser: async () => null, submitScorePpGuessForUser: async () => ({}),
}));
const actions = await import("@/actions/score-pp-server");
const { hasGuestDailyAccess, getGuestDailyCookieName } = await import("@/lib/game/guest-daily-access");
beforeEach(() => cookieValues.clear());

test("guest Score pp issues the same browser access needed for results", async () => {
    const id = await actions.startScorePpRunAction("classic", undefined, "daily");
    expect(hasGuestDailyAccess(id, cookieValues.get(getGuestDailyCookieName(id)))).toBe(true);
});

test("guest Score pp actions require the issuing browser", async () => {
    await expect(actions.resumeScorePpRunAction(sessionId)).rejects.toThrow("Game session not found or expired");
    await actions.startScorePpRunAction("classic", undefined, "daily");
    await expect(actions.resumeScorePpRunAction(sessionId)).resolves.toBeDefined();
});
