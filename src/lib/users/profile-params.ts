import { GameMode } from "@/actions/types";
import { GAME_VARIANTS, GameVariant } from "@/app/games/config";
import { z } from "zod";

const profileModeSchema = z.nativeEnum(GameMode).catch(GameMode.Background);
const profileVariantSchema = z.union([z.enum(GAME_VARIANTS), z.literal("daily")]).catch("daily");

export type ProfileVariant = GameVariant | "daily";

export function parseProfileFilters(mode?: string, variant?: string): { mode: GameMode; variant: ProfileVariant } {
    return {
        mode: profileModeSchema.parse(mode),
        variant: profileVariantSchema.parse(variant),
    };
}
