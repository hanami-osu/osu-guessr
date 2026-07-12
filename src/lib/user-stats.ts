import { GameMode, GameVariant, UserAchievement } from "@/actions/types";

export function getHighestScore(achievements: UserAchievement[] = []): number {
    return achievements.reduce((highest, achievement) => Math.max(highest, achievement.highest_score), 0);
}

export function hasPlayedGame(achievements: UserAchievement[], variant: GameVariant, mode?: GameMode): boolean {
    return achievements.some((achievement) => achievement.variant === variant && achievement.games_played > 0 && (!mode || achievement.game_mode === mode));
}
