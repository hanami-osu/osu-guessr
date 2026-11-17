import { describe, expect, test } from "bun:test";
import { createLatestRequestGate } from "@/lib/latest-request";

describe("createLatestRequestGate", () => {
    test("only the newest request can update search results", () => {
        const gate = createLatestRequestGate();
        const first = gate.begin();
        const latest = gate.begin();

        expect(first.isCurrent()).toBe(false);
        expect(latest.isCurrent()).toBe(true);
    });

    test("cancels a request without invalidating a newer one", () => {
        const gate = createLatestRequestGate();
        const first = gate.begin();
        const latest = gate.begin();

        first.cancel();
        expect(latest.isCurrent()).toBe(true);

        latest.cancel();
        expect(latest.isCurrent()).toBe(false);
    });
});
