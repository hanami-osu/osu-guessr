export enum GameMode {
    Background = "background",
    Audio = "audio",
    Skin = "skin"
}
export type GameVariant = "classic" | "death";
export type ReportType = "incorrect_title" | "inappropriate_content" | "wrong_audio" | "wrong_background" | "other";
export type ReportStatus = "pending" | "investigating" | "resolved" | "rejected";

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
}

export interface MapsetDataWithTags extends MapsetData, MapsetTags {}

export interface SkinData {
    id: number;
    name: string;
    image_filename: string;
    created_at: Date;
    updated_at: Date;
}

export type GuessResult = {
    correct: boolean;
    answer: string;
    type: "guess" | "timeout" | "skip";
};

export interface GameState {
    sessionId: string;
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
    badges: Array<UserBadge>;
    created_at: Date;
}

export interface UserAchievement {
    user_id: number;
    game_mode: GameMode;
    variant: GameVariant;
    total_score: bigint;
    games_played: number;
    highest_streak: number;
    highest_score: number;
    last_played: Date;
}

export interface UserRanks {
    globalRank?: {
        classic?: number;
        death?: number;
    };
    modeRanks: {
        [key in GameMode]: {
            classic?: number;
            death?: number;
        };
    };
}

export interface UserWithStats extends User {
    achievements?: UserAchievement[];
    ranks?: UserRanks;
}

export interface Game {
    user_id: number;
    game_mode: GameMode;
    points: number;
    streak: number;
    variant: GameVariant;
    ended_at: Date;
}

export interface TopPlayer extends User {
    total_score: bigint;
    games_played: number;
    highest_streak: number;
    highest_score: number;
    variant: GameVariant;
}

export interface HighestStats {
    highest_points: number;
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

// Database types for game sessions
export interface DatabaseGameSession {
    id: string;
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
    is_active: boolean;
    variant: GameVariant;
    // Joined fields from mapset_data/mapset_tags or skins table
    title: string;
    artist: string;
    mapper: string;
    image_filename: string;
    audio_filename: string;
    has_guessed_current_round: boolean;
}
