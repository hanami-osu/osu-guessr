import { describe, expect, test } from "bun:test";
import { GameMode, UserAchievement } from "@/actions/types";
import { getHighestScore, hasPlayedGame } from "./user-stats";

const audioAchievement: UserAchievement = {
    user_id: 1,
    game_mode: GameMode.Audio,
    variant: "classic",
    ruleset_version: 1,
    pp_version: 1,
    total_score: 100n,
    games_played: 2,
    rounds_played: 20,
    total_correct: 16,
    total_skips: 2,
    total_timeouts: 2,
    total_response_time_ms: 100_000n,
    highest_streak: 1,
    highest_score: 75,
    best_run_pp: 0,
    profile_pp: 0,
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
