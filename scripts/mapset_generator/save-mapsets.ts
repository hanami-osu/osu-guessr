import { z } from "zod";
import { prisma } from "../../src/lib/database/prisma";

const mapsetSchema = z.object({
    mapsetId: z.number().int().positive(),
    title: z.string(),
    artist: z.string(),
    mapper: z.string(),
    imageFilename: z.string(),
    audioFilename: z.string(),
});

try {
    const input = process.argv[2];
    if (!input) throw new Error("Expected a mapset import file");
    const rows = (await Bun.file(input).text()).trim().split("\n").map((line) => mapsetSchema.parse(JSON.parse(line)));
    for (const { mapsetId, imageFilename, audioFilename, ...metadata } of rows) {
        const where = { mapsetId };
        const media = { imageFilename, audioFilename };
        await prisma.$transaction([
            prisma.mapsetData.upsert({ where, create: { mapsetId, ...metadata }, update: { ...metadata, rankedAt: null, starRatingMin: null, starRatingMax: null } }),
            prisma.mapsetTag.upsert({ where, create: { mapsetId, ...media }, update: media }),
        ]);
    }
} finally {
    await prisma.$disconnect();
}
