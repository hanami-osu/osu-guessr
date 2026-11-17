import { describe, expect, test } from "bun:test";
import { isLocale } from "@/lib/i18n/translations";

describe("isLocale", () => {
    test("rejects inherited object property names", () => {
        for (const inheritedName of ["constructor", "toString", "__proto__"]) {
            expect(isLocale(inheritedName)).toBe(false);
        }
    });
});
