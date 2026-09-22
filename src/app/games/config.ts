import { GameMode } from "@/actions/types";

export type { GameVariant } from "@/actions/types";

export const ROUND_TIME = 30;
export const SKIP_PENALTY = 50;
export const BASE_POINTS = 100;
export const STREAK_BONUS = 25;
export const TIME_BONUS_MULTIPLIER = 2;
export const MAX_ROUNDS = 15;
export const AUTO_ADVANCE_DELAY_MS = 8000;
export const SURVIVAL_LIVES = 3;

export const GAME_MODES = [
    { id: GameMode.Background, label: "Background Guessr", image: "/ghostrule.webp", url: "/games/background" },
    { id: GameMode.Audio, label: "Audio Guessr", image: "/audio-mode.webp", url: "/games/audio" },
    { id: GameMode.Skin, label: "Skin Guessr", image: "/skin-mode.webp", url: "/games/skin" },
    { id: GameMode.ScorePp, label: "Score pp", image: "/main_bg.webp", url: "/games/score-pp" },
] as const;
