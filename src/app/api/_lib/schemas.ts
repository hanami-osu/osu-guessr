import { GAME_VARIANTS, GameMode } from "@/actions/types";
import { z } from "zod";

export const apiGameModeSchema = z.nativeEnum(GameMode);
export const apiVariantSchema = z.enum(GAME_VARIANTS);
export const apiUserIdSchema = z.coerce.number().int().positive();
