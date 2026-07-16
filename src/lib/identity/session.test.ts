import { describe, expect, test } from "bun:test";
import { HANAMI_SESSION_VERSION, isHanamiSessionToken, parseHanamiSessionToken } from "./session";

describe("Hanami session versioning", () => {
    const activeToken = {
        hanamiUserId: "hanami-user-123",
        banchoId: 17279598,
        hanamiSessionVersion: HANAMI_SESSION_VERSION,
    };

    test("accepts a canonical Hanami session token", () => {
        expect(parseHanamiSessionToken(activeToken)).toEqual(activeToken);
    });

    test("rejects legacy sessions without the canonical identity", () => {
        expect(isHanamiSessionToken({ banchoId: 17279598 })).toBe(false);
    });

    test("rejects an older session version", () => {
        expect(isHanamiSessionToken({ ...activeToken, hanamiSessionVersion: 0 })).toBe(false);
    });
});
