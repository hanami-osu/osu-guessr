import type { GameState } from "@/actions/types";

export interface GameSession {
    id: string;
    state: GameState;
    timer: NodeJS.Timeout | null;
    isActive: boolean;
}

export interface GameClientConfig {
    maxRetries: number;
    retryDelay: number;
}

export interface GameClientEvents {
    onStateUpdate: (state: GameState) => void;
    onError?: (error: Error) => void;
}

export interface GameMediaProps {
    mediaUrl: string;
    isRevealed: boolean;
    result?: {
        correct: boolean;
        answer?: string;
        type: "guess" | "timeout" | "skip";
    };
    songInfo?: {
        title?: string;
        artist?: string;
        mapper?: string;
        mapsetId?: number;
    };
}
