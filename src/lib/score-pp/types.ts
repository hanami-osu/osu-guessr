import type { GameRoundResult } from "@/actions/types";

export interface ScorePpPlayerSnapshot {
    userId: number;
    username: string;
    avatarUrl: string;
    globalRank: number | null;
}

export interface ScorePpBeatmapSnapshot {
    beatmapId: number;
    beatmapsetId: number;
    artist: string;
    title: string;
    difficultyName: string;
    starRating: number;
    maxCombo?: number | null;
    backgroundUrl: string;
    beatmapUrl: string;
}

export interface ScorePpHitStatisticsSnapshot {
    great: number;
    ok: number;
    meh: number;
    miss: number;
    perfect?: number;
    good?: number;
}

export interface ScorePpScoreSnapshot {
    sourceScoreId: string;
    player: ScorePpPlayerSnapshot;
    beatmap: ScorePpBeatmapSnapshot;
    mods: string[];
    score: string;
    accuracy: number;
    maxCombo: number;
    statistics: ScorePpHitStatisticsSnapshot;
    pp: number;
    endedAt: string;
}

export interface ScorePpPairSnapshot {
    id: number;
    batchId: string;
    left: ScorePpScoreSnapshot;
    right: ScorePpScoreSnapshot;
    ppGap: number;
}

export type ScorePpPublicScore = Omit<ScorePpScoreSnapshot, "pp">;

export interface ScorePpPublicPair {
    id: number;
    left: ScorePpPublicScore;
    right: ScorePpPublicScore;
}

export interface ScorePpResolution {
    correct: boolean;
    resultType: GameRoundResult;
    selectedScoreId: string | null;
    higherScoreId: string;
    scorePp: Record<string, number>;
    ppGap: number;
    pointsEarned: number;
    totalPoints: number;
    streak: number;
    maxStreak: number;
    correctAnswers: number;
    mistakes: number;
    responseTimeMs: number;
    terminal: boolean;
    runPp?: number;
}

export interface ScorePpRoundLoad {
    pair: ScorePpPublicPair | null;
    deadlineAt: number | null;
    terminal: boolean;
    saved: boolean;
    runPp?: number;
}

export interface ScorePpRunState {
    active: boolean;
    terminal: boolean;
    saved: boolean;
    round: number;
    pair: ScorePpPublicPair | null;
    deadlineAt: number | null;
    resolution: ScorePpResolution | null;
    points: number;
    streak: number;
    maxStreak: number;
    mistakes: number;
    runPp?: number;
}
