import { describe, expect, test } from "bun:test";
import { parseHanamiIdentityClaims } from "./claims";

const validClaims = {
    sub: "hanami-user-123",
    osu_id: "17279598",
    account_complete: true,
    name: "player",
    picture: "https://a.ppy.sh/17279598",
};

describe("parseHanamiIdentityClaims", () => {
    test("accepts the active-account claims used by osu!guessr", () => {
        expect(parseHanamiIdentityClaims(validClaims)).toEqual({
            hanamiUserId: "hanami-user-123",
            banchoId: 17279598,
            name: "player",
            image: "https://a.ppy.sh/17279598",
        });
    });

    test.each([
        [{ ...validClaims, sub: undefined }, "missing sub"],
        [{ ...validClaims, osu_id: undefined }, "missing osu_id"],
        [{ ...validClaims, osu_id: "12.5" }, "malformed osu_id"],
        [{ ...validClaims, osu_id: "0" }, "non-positive osu_id"],
        [{ ...validClaims, account_complete: false }, "incomplete account"],
    ])("rejects %s", (claims) => {
        expect(() => parseHanamiIdentityClaims(claims)).toThrow();
    });

    test("does not use display data as identity", () => {
        const parsed = parseHanamiIdentityClaims({
            ...validClaims,
            name: "",
            picture: "not a URL",
            email: "shared@example.com",
        });
        expect(parsed.hanamiUserId).toBe(validClaims.sub);
        expect(parsed.banchoId).toBe(17279598);
        expect(parsed.name).toBeNull();
        expect(parsed.image).toBeNull();
    });
});
