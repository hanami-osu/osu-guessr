import { describe, expect, test } from "bun:test";
import { buildSitemapXml, PUBLIC_SITEMAP_ROUTES } from "./sitemap";

describe("sitemap generation", () => {
    test("contains each public route exactly once and excludes private or nonexistent routes", () => {
        const paths = PUBLIC_SITEMAP_ROUTES.map((route) => route.path);
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths).not.toContain("/games");
        expect(paths).not.toContain("/settings");
    });

    test("uses the configured public origin without duplicate routes", () => {
        const xml = buildSitemapXml("https://example.com/app/");
        expect(xml).toContain("<loc>https://example.com/</loc>");
        expect(xml.match(/<loc>https:\/\/example\.com\/about<\/loc>/g)).toHaveLength(1);
    });

    test("escapes XML values", () => {
        const xml = buildSitemapXml("https://example.com", [{ path: "/search?one=1&two=2", changeFrequency: "monthly", priority: 0.5 }]);
        expect(xml).toContain("one=1&amp;two=2");
    });
});
