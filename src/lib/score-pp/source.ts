import type { ScorePpBeatmapSnapshot, ScorePpHitStatisticsSnapshot, ScorePpPlayerSnapshot, ScorePpScoreSnapshot } from "./types";

export interface ScorePpSourceScore {
    sourceScoreId: string;
    userId: number;
    beatmapId: number;
    mods: string[];
    score: string;
    accuracy: number;
    maxCombo: number;
    statistics: ScorePpHitStatisticsSnapshot;
    pp: number;
    endedAt: string;
}

export interface ScorePpScoreSource {
    getRandomCandidateUserIds(limit: number): Promise<number[]>;
    getTopScores(userId: number, limit: number): Promise<ScorePpSourceScore[]>;
    close(): Promise<void>;
}

export interface ScorePpMetadataSource {
    getPlayer(userId: number): Promise<ScorePpPlayerSnapshot | null>;
    getBeatmap(beatmapId: number): Promise<ScorePpBeatmapSnapshot | null>;
    enrichScore(score: ScorePpSourceScore, player?: ScorePpPlayerSnapshot): Promise<ScorePpScoreSnapshot | null>;
}
