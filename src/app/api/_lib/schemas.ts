import { GameMode } from "@/actions/types";
import { z } from "zod";

export const apiGameModeSchema = z.nativeEnum(GameMode);
export const apiVariantSchema = z.enum(["classic", "survival"]);
export const apiUserIdSchema = z.coerce.number().int().positive();
