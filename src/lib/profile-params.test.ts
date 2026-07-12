import { describe, expect, test } from "bun:test";
import { GameMode } from "@/actions/types";
import { parseProfileFilters } from "./profile-params";

describe("parseProfileFilters", () => {
    test("accepts supported profile filters", () => {
        expect(parseProfileFilters("audio", "death")).toEqual({ mode: GameMode.Audio, variant: "death" });
    });

    test("falls back when profile filters are missing or invalid", () => {
        expect(parseProfileFilters()).toEqual({ mode: GameMode.Background, variant: "classic" });
        expect(parseProfileFilters("invalid", "endless")).toEqual({ mode: GameMode.Background, variant: "classic" });
    });
});
