export enum GameMode {
    Background = "background",
    Audio = "audio",
    Skin = "skin"
}
export type GameVariant = "classic" | "survival" | "death";
export type GameRunType = "standard" | "daily" | "challenge" | "practice";
export type GameEndReason = "completed" | "failed" | "quit" | "content_exhausted";
export type GameRoundResult = "guess" | "skip" | "timeout";
export type GameItemType = "mapset" | "skin";
export type ReportType = "incorrect_title" | "inappropriate_content" | "wrong_audio" | "wrong_background" | "other";
type ReportStatus = "pending" | "investigating" | "resolved" | "rejected";

export interface ApiKey {
    id: string;
    name: string;
    created_at: Date;
    last_used: Date | null;
    user_id: number;
}

export interface MapsetTags {
    mapset_id: number;
    image_filename: string;
    audio_filename: string;
}

export interface MapsetData {
    mapset_id: number;
    title: string;
    artist: string;
    mapper: string;
    ranked_at?: Date | null;
    star_rating_min?: number | null;
    star_rating_max?: number | null;
}

export interface MapsetDataWithTags extends MapsetData, MapsetTags {}

export interface SkinData {
    id: number;
    name: string;
    image_filename: string;
    created_at: Date;
    updated_at: Date;
}

type GuessResult = {
    correct: boolean;
    answer: string;
    type: "guess" | "timeout" | "skip";
};

export interface GameState {
    sessionId: string;
    pp?: number;
    currentBeatmap: {
        imageUrl?: string;
        audioUrl?: string;
        revealed: boolean;
        title?: string;
        artist?: string;
        mapper?: string;
        mapsetId?: number;
    };
    score: {
        total: number;
        current: number;
        streak: number;
        highestStreak: number;
    };
    rounds: {
        current: number;
        total: number;
        correctGuesses: number;
        totalTimeUsed: number;
        mistakes: number;
    };
    timeLeft: number;
    gameStatus: "active" | "finished";
    lastGuess?: GuessResult;
    variant: GameVariant;
}

export interface UserBadge {
    name: string;
    color: string;
    assigned_at: Date;
}

export interface User {
    bancho_id: number;
    username: string;
    avatar_url: string;
    banner_url: string | null;
    badges: Array<UserBadge>;
    created_at: Date;
}

export interface UserAchievement {
    user_id: number;
    game_mode: GameMode;
    variant: GameVariant;
    ruleset_version: number;
    pp_version: number;
    total_score: bigint;
    games_played: number;
    rounds_played: number;
    total_correct: number;
    total_skips: number;
    total_timeouts: number;
    total_response_time_ms: bigint;
    highest_streak: number;
    highest_score: number;
    best_run_pp: string | number;
    profile_pp: string | number;
    last_played: Date;
}

export interface UserRanks {
    globalRank?: {
        classic?: number;
        survival?: number;
        death?: number;
    };
    modeRanks: {
        [key in GameMode]: {
            classic?: number;
            survival?: number;
            death?: number;
        };
    };
}

export interface UserWithStats extends User {
    achievements?: UserAchievement[];
    ranks?: UserRanks;
}

export interface Game {
    id: string;
    user_id: number;
    game_mode: GameMode;
    points: number;
    streak: number;
    variant: GameVariant;
    ruleset_version: number;
    pp_version: number;
    pp: string | number;
    ended_at: Date;
}

export interface UserLifetimeModeStats {
    games_played: number;
    total_score: bigint;
    highest_score: number;
    highest_streak: number;
    average_streak: number;
    last_played: Date | null;
}

export interface UserRankHistoryPoint {
    rank: number;
    recorded_at: Date;
}

export interface TopPlayer extends Omit<User, "badges"> {
    badges: Array<Pick<UserBadge, "name" | "color">>;
    total_score: bigint;
    games_played: number;
    highest_streak: number;
    highest_score: number;
    best_run_pp: string | number;
    profile_pp: string | number;
    last_played: Date;
}

export interface HighestStats {
    highest_points: number;
    highest_run_pp: number;
    total_games: number;
    total_users: number;
}

export interface Report {
    id: number;
    user_id: number;
    mapset_id: number;
    report_type: ReportType;
    description: string;
    status: ReportStatus;
    created_at: Date;
    updated_at: Date;
}

export interface Announcement {
    id: number;
    title: string;
    content: string;
    created_at: string;
}

export interface DatabaseGameSession {
    id: string;
    pp?: number;
    user_id: number;
    game_mode: GameMode;
    total_points: number;
    current_streak: number;
    highest_streak: number;
    current_round: number;
    current_item_id: number;
    time_left: number;
    last_action_at: string | Date;
    last_guess: string | null;
    last_guess_correct: number | null;
    last_points: number | null;
    correct_guesses: number;
    total_time_used: number;
    total_response_time_ms: number;
    is_active: boolean;
    end_pending?: boolean;
    end_reason?: GameEndReason;
    variant: GameVariant;
    run_type: GameRunType;
    challenge_id: string | null;
    seed: string | null;
    config_snapshot: Record<string, unknown> | null;
    ranked: boolean;
    ruleset_version: number;
    pp_version: number;
    started_at: string | Date;
    round_history: PersistedGameRound[];
    title: string;
    artist: string;
    mapper: string;
    image_filename: string;
    audio_filename: string;
    has_guessed_current_round: boolean;
}

export interface PersistedGameRound {
    round_number: number;
    item_type: GameItemType;
    item_id: number;
    submitted_guess: string | null;
    answer_snapshot: string;
    result_type: GameRoundResult;
    correct: boolean;
    response_time_ms: number;
    time_limit_ms: number;
    points_earned: number;
    streak_before: number;
    streak_after: number;
    difficulty_snapshot: number | null;
    content_snapshot: Record<string, unknown> | null;
}
