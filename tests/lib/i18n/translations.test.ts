import { describe, expect, test } from "bun:test";
import { isLocale, languages } from "@/lib/i18n/translations";

describe("isLocale", () => {
    test("accepts every registered locale", () => {
        for (const locale of Object.keys(languages)) {
            expect(isLocale(locale)).toBe(true);
        }
    });

    test("rejects inherited object property names", () => {
        for (const inheritedName of ["constructor", "toString", "__proto__"]) {
            expect(isLocale(inheritedName)).toBe(false);
        }
    });
});
