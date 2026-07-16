import { z } from "zod";

export const HANAMI_SESSION_VERSION = 1;

const hanamiTokenSchema = z.object({
    hanamiUserId: z.string().min(1).max(255),
    banchoId: z.number().int().positive().max(2_147_483_647),
    hanamiSessionVersion: z.literal(HANAMI_SESSION_VERSION),
});

export type HanamiSessionToken = z.infer<typeof hanamiTokenSchema>;

export function parseHanamiSessionToken(token: unknown): HanamiSessionToken {
    return hanamiTokenSchema.parse(token);
}

export function isHanamiSessionToken(token: unknown): token is HanamiSessionToken {
    return hanamiTokenSchema.safeParse(token).success;
}
