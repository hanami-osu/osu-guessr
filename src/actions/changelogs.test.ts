import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

mock.module("server-only", () => ({}));

const { readChangelogs } = await import("./changelogs");

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function mockFetch(response: Response) {
    const fetchMock = mock(async () => response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

describe("readChangelogs", () => {
    test("maps GitHub releases newest first and skips drafts", async () => {
        mockFetch(
            Response.json([
                { tag_name: "v2.0.0", name: "Big update", created_at: "2025-08-15T00:00:00Z", html_url: "https://github.com/r/v2", body_html: null, draft: false },
                { tag_name: "v2.1.0", name: "Draft", created_at: "2026-01-01T00:00:00Z", html_url: "https://github.com/r/draft", body_html: "<p>Draft</p>", draft: true },
                { tag_name: "v3.0.0", name: "", created_at: "2026-11-01T12:00:00Z", html_url: "https://github.com/r/v3", body_html: "<p>Three</p>", draft: false },
            ]),
        );

        expect(await readChangelogs()).toEqual([
            { version: "v3.0.0", date: "2026-11-01T12:00:00Z", url: "https://github.com/r/v3", bodyHtml: "<p>Three</p>" },
            { version: "Big update", date: "2025-08-15T00:00:00Z", url: "https://github.com/r/v2", bodyHtml: "" },
        ]);
    });

    test("returns no releases when GitHub fails", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(() => {});
        try {
            mockFetch(new Response("rate limited", { status: 403 }));
            expect(await readChangelogs()).toEqual([]);
        } finally {
            consoleError.mockRestore();
        }
    });
});
