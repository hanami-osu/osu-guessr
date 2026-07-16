import { z } from "zod";

const MAX_MYSQL_SIGNED_INT = 2_147_483_647;

const decimalOsuIdSchema = z
    .union([
        z.string().regex(/^[1-9]\d*$/, "osu_id must be a positive decimal user ID"),
        z.number().int().positive(),
    ])
    .transform((value, context) => {
        const parsed = typeof value === "number" ? value : Number(value);
        if (!Number.isSafeInteger(parsed) || parsed > MAX_MYSQL_SIGNED_INT) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "osu_id is outside the supported user ID range",
            });
            return z.NEVER;
        }
        return parsed;
    });

const identityClaimsSchema = z
    .object({
        sub: z
            .string()
            .min(1)
            .max(255)
            .refine((value) => value.trim() === value, "sub must not contain surrounding whitespace"),
        osu_id: decimalOsuIdSchema,
        account_complete: z.literal(true),
    })
    .passthrough();

export interface HanamiIdentityClaims {
    hanamiUserId: string;
    banchoId: number;
    name: string | null;
    image: string | null;
}

export function parseHanamiIdentityClaims(profile: unknown): HanamiIdentityClaims {
    const claims = identityClaimsSchema.parse(profile);
    const raw = profile as Record<string, unknown>;

    const name = typeof raw.name === "string" && raw.name.length > 0 && raw.name.length <= 255 ? raw.name : null;
    const imageResult = z.string().url().safeParse(raw.picture);

    return {
        hanamiUserId: claims.sub,
        banchoId: claims.osu_id,
        name,
        image: imageResult.success ? imageResult.data : null,
    };
}
