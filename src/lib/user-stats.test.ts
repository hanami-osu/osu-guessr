import { describe, expect, test } from "bun:test";
import { GameMode, UserAchievement } from "@/actions/types";
import { getHighestScore, hasPlayedGame } from "./user-stats";

const audioAchievement: UserAchievement = {
    user_id: 1,
    game_mode: GameMode.Audio,
    variant: "classic",
    total_score: 100n,
    games_played: 2,
    highest_streak: 1,
    highest_score: 75,
    last_played: new Date(0),
};

describe("user stat helpers", () => {
    test("returns zero for an empty high score", () => {
        expect(getHighestScore()).toBe(0);
        expect(getHighestScore([audioAchievement])).toBe(75);
    });

    test("only considers variants and modes with completed games as ranked", () => {
        expect(hasPlayedGame([audioAchievement], "classic", GameMode.Audio)).toBe(true);
        expect(hasPlayedGame([audioAchievement], "death", GameMode.Audio)).toBe(false);
        expect(hasPlayedGame([audioAchievement], "classic", GameMode.Background)).toBe(false);
    });
});
