import { z } from "zod";

const screenshotSchema = z.object({
    category: z.number().int().nonnegative(),
    gamemode: z.number().int().nonnegative(),
    large: z.string().url(),
    medium: z.string().url(),
    small: z.string().url(),
});

const skinDataSchema = z.object({
    _nsfw: z.boolean(),
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    gamemodes: z.array(z.number().int().nonnegative()),
    screenshots: z.array(screenshotSchema).min(1),
    link_to_skin: z.string().url(),
});

const skinApiResponseSchema = z.discriminatedUnion("status", [
    z.object({ status: z.literal("success"), message: skinDataSchema }),
    z.object({ status: z.literal("failed"), message: z.enum(["rate limited", "no api key", "invalid api key"]) }),
]);

export type SkinImportData = z.infer<typeof skinDataSchema>;

export function parseSkinApiResponse(input: unknown, requestedSkinId: number): SkinImportData {
    const response = skinApiResponseSchema.parse(input);

    if (response.status === "failed") {
        throw new Error(`Skin API error: ${response.message}`);
    }

    if (response.message.id !== requestedSkinId) {
        throw new Error("Skin API returned an unexpected skin ID.");
    }

    if (response.message._nsfw) {
        throw new Error("NSFW skins are not allowed.");
    }

    return response.message;
}
