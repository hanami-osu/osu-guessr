import { GameMode, type GameVariant } from "@/actions/types";

export { GAME_VARIANTS, type GameVariant } from "@/actions/types";

export const ROUND_TIME = 30;
export const SKIP_PENALTY = 50;
export const BASE_POINTS = 100;
export const STREAK_BONUS = 25;
export const TIME_BONUS_MULTIPLIER = 2;
export const MAX_ROUNDS = 15;
export const AUTO_ADVANCE_DELAY_MS = 8000;
/** English variant names for the places that are not translated yet (multiplayer). */
export const VARIANT_LABELS: Record<GameVariant, string> = { classic: "Classic", survival: "Survival", death: "Death" };

export const SURVIVAL_LIVES = 3;
export const DEATH_LIVES = 1;

/** Survival and death run until the player is out of lives; classic has a fixed round count. */
export function isContinuousVariant(variant: GameVariant): boolean {
    return variant !== "classic";
}

export function getVariantLives(variant: GameVariant): number {
    return variant === "death" ? DEATH_LIVES : SURVIVAL_LIVES;
}

/** True when one more mistake ends a survival or death run. */
export function isOnLastLife(variant: GameVariant, mistakes: number): boolean {
    return isContinuousVariant(variant) && getVariantLives(variant) - mistakes <= 1;
}

export const GAME_MODES = [
    { id: GameMode.Background, label: "Background Guessr", image: "/ghostrule.webp", url: "/games/background" },
    { id: GameMode.Audio, label: "Audio Guessr", image: "/audio-mode.webp", url: "/games/audio" },
    { id: GameMode.Skin, label: "Skin Guessr", image: "/skin-mode.webp", url: "/games/skin" },
    { id: GameMode.ScorePp, label: "Score pp", image: "/main_bg.webp", url: "/games/score-pp" },
] as const;
