import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import ScoreResultCard from "./ScoreResultCard";

describe("score result card", () => {
    test("renders guest daily scores with the shared muted points styling", () => {
        const markup = renderToStaticMarkup(
            <ScoreResultCard
                title="Your score"
                subtitle="Background Guessr · Daily Challenge · 11/17/2026"
                pointsLabel="Total Points"
                points="500"
                statsClassName="grid grid-cols-2"
                stats={[{ label: "Total Points", value: "500" }, { label: "Correct", value: "4/5" }]}
            />,
        );

        expect(markup).toContain("Your score");
        expect(markup).toContain("text-muted-foreground");
        expect(markup).not.toContain("text-primary");
        expect(markup).toContain("4/5");
    });
});