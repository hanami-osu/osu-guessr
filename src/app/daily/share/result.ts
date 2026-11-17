import { z } from "zod";

export const dailyShareSchema = z.object({
    mode: z.enum(["background", "audio", "skin", "score_pp"]),
    day: z.coerce.number().int().min(1).max(100_000),
    points: z.coerce.number().int().min(-250).max(10_000),
    time: z.coerce.number().int().min(0).max(150_000),
    rounds: z.string().regex(/^[cist]{5}$/),
});
