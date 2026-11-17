import { afterEach, expect, mock, setSystemTime, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/actions/game-server", () => ({ getDailyChallengeInfoAction: async () => ({}) }));

let viewer: number | undefined;
const game = { id: 1n, userId: 1, gameMode: "background", variant: "classic", runType: "daily", configSnapshot: { dailyDate: "2026-11-17", dailyDay: 3 },
    startedAt: new Date("2026-11-17T12:00:00Z"), endedAt: new Date("2026-11-17T12:02:00Z"), roundsPlayed: 5, correctCount: 3, points: 400, pp: 0, ppVersion: 1, streak: 2, totalResponseTimeMs: 50_000n };
mock.module("@/lib/database/prisma", () => ({ prisma: {
    game: { findUnique: async () => game },
    gameRound: { findMany: async () => [] },
    user: { findFirst: async () => ({ banchoId: 1, username: "Player", avatarUrl: "", bannerUrl: null }) },
} }));
mock.module("@/lib/auth/auth", () => ({ auth: async () => viewer ? { user: { banchoId: viewer } } : null }));
mock.module("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
mock.module("next/navigation", () => ({ notFound: () => { throw new Error("notfound"); }, redirect: () => { throw new Error("redirect"); } }));
const { default: ScorePage } = await import("./page");
const props = { params: Promise.resolve({ id: "1" }), searchParams: Promise.resolve({}) };
afterEach(() => setSystemTime());

test.each([
    [undefined, "redirect"],
    [2, "notfound"],
] as const)("keeps today's daily answers private for viewer %s", async (userId, error) => {
    viewer = userId;
    setSystemTime(new Date("2026-11-17T23:59:59Z"));
    await expect(ScorePage(props)).rejects.toThrow(error);
});

test.each([undefined, 1] as const)("allows yesterday's answers after the UTC reset for viewer %s", async (userId) => {
    viewer = userId;
    setSystemTime(new Date("2026-11-18T00:00:00Z"));
    await expect(ScorePage(props)).resolves.toBeDefined();
});
