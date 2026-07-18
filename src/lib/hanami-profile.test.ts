import { describe, expect, it } from "bun:test";

import { getHanamiProfileUrl } from "./hanami-profile";

describe("Hanami profile portal URL", () => {
    it("uses the configured Hanami origin and only the local profile path", () => {
        expect(getHanamiProfileUrl("https://accounts.hanami.example/staging?osuId=123#token")).toBe("https://accounts.hanami.example/profile");
    });

    it("does not build links from unsafe or missing configuration", () => {
        expect(getHanamiProfileUrl("javascript:alert(1)")).toBeNull();
        expect(getHanamiProfileUrl(undefined)).toBeNull();
    });
});
