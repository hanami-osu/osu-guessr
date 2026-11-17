import { describe, expect, mock, test } from "bun:test";
import { applySupporterBadge, parseSupporterBadge, SUPPORTER_BADGE } from "@/lib/users/supporter";

const claims = {
    badge: "https://hanami.yorunoken.com/claims/supporter_badge",
};

describe("supporter claims", () => {
    test("reads the supporter scope claims", () => {
        expect(parseSupporterBadge({ [claims.badge]: true })).toBe(true);
        expect(parseSupporterBadge({ [claims.badge]: false })).toBe(false);
    });

    test("returns nothing when the scope was not granted", () => {
        expect(parseSupporterBadge({})).toBeNull();
    });
});

describe("applySupporterBadge", () => {
    function database(existingUsers: number) {
        return {
            user: { findUnique: mock(async () => (existingUsers ? { banchoId: 7 } : null)) },
            userBadge: { upsert: mock(async () => ({})) },
        };
    }

    test("adds the permanent badge", async () => {
        const db = database(1);
        await applySupporterBadge(db as never, 7, true);

        expect(db.userBadge.upsert).toHaveBeenCalledWith({
            where: { userId_badgeName: { userId: 7, badgeName: SUPPORTER_BADGE } },
            update: {},
            create: { userId: 7, badgeName: SUPPORTER_BADGE },
        });
    });

    test("never removes a badge", async () => {
        const db = database(1);
        await applySupporterBadge(db as never, 7, false);
        expect(db.userBadge.upsert).not.toHaveBeenCalled();
    });

    test("skips players who have not played osu!guessr", async () => {
        const db = database(0);
        await applySupporterBadge(db as never, 7, true);
        expect(db.userBadge.upsert).not.toHaveBeenCalled();
    });
});
