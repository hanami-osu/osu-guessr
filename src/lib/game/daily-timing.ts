import type { DatabaseGameSession, PersistedGameRound } from "@/actions/types";
import { AUTO_ADVANCE_DELAY_MS } from "@/app/games/config";
import { calculateArcadeScore } from "./arcade-score";
import { DAILY_ROUNDS, DAILY_ROUND_TIME } from "./daily";

type DailyItem = Partial<Pick<DatabaseGameSession, "current_item_id" | "current_score_pp_pair" | "title" | "artist" | "mapper" | "image_filename" | "audio_filename">>;
type TimeoutItem = Pick<PersistedGameRound, "item_id" | "item_type" | "answer_snapshot" | "difficulty_snapshot" | "content_snapshot">;

export async function catchUpDailyRounds(
    game: DatabaseGameSession,
    force: boolean,
    loadItem: (round: number) => Promise<DailyItem>,
    timeoutItem: (game: DatabaseGameSession) => TimeoutItem,
): Promise<DatabaseGameSession> {
    const now = Date.now();
    const roundTimeMs = DAILY_ROUND_TIME * 1000;
    const firstUnansweredRound = game.has_guessed_current_round ? game.current_round + 1 : game.current_round;

    for (let round = firstUnansweredRound; round <= DAILY_ROUNDS; round++) {
        if (round > game.current_round) {
            const nextAt = new Date(game.last_action_at).getTime() + AUTO_ADVANCE_DELAY_MS;
            if (!force && now < nextAt) break;

            game = {
                ...game,
                ...(await loadItem(round)),
                current_round: round,
                last_action_at: new Date(force ? now : nextAt).toISOString(),
                has_guessed_current_round: false,
                last_guess: null,
                time_left: DAILY_ROUND_TIME,
            };
        }

        const deadline = new Date(game.last_action_at).getTime() + roundTimeMs;
        if (!force && now < deadline) break;

        const points = calculateArcadeScore(false, 0, game.current_streak);
        const answeredAt = new Date(force ? now : deadline).toISOString();
        const timedOutRound: PersistedGameRound = {
            ...timeoutItem(game),
            round_number: round,
            submitted_guess: null,
            result_type: "timeout",
            correct: false,
            response_time_ms: roundTimeMs,
            time_limit_ms: roundTimeMs,
            answered_at: answeredAt,
            points_earned: points,
            streak_before: game.current_streak,
            streak_after: 0,
        };
        game = {
            ...game,
            total_points: game.total_points + points,
            current_streak: 0,
            total_time_used: game.total_time_used + DAILY_ROUND_TIME,
            total_response_time_ms: game.total_response_time_ms + roundTimeMs,
            round_history: [...game.round_history, timedOutRound],
            last_action_at: answeredAt,
            has_guessed_current_round: true,
            last_guess: "TIMEOUT",
            last_guess_correct: 0,
            last_points: points,
            time_left: 0,
        };
    }
    return game;
}
