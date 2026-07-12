import { GameMode } from "@/actions/types";
import { GameVariant } from "@/app/games/config";
import { z } from "zod";

const profileModeSchema = z.nativeEnum(GameMode).catch(GameMode.Background);
const profileVariantSchema = z.enum(["classic", "death"]).catch("classic");

export function parseProfileFilters(mode?: string, variant?: string): { mode: GameMode; variant: GameVariant } {
    return {
        mode: profileModeSchema.parse(mode),
        variant: profileVariantSchema.parse(variant),
    };
}
