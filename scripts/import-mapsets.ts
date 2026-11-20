import { prisma } from "@/lib/database/prisma";
import { importMapset, parseMapsetIds } from "@/lib/media/mapset-import";

async function main(): Promise<void> {
    const input = process.argv[2];
    if (!input) throw new Error("Usage: bun run import:mapsets <file with one beatmapset URL per line>");

    const mapsetIds = parseMapsetIds(await Bun.file(input).text());
    if (mapsetIds.length === 0) throw new Error(`No beatmapset URLs found in ${input}`);

    const failed: number[] = [];
    for (const [index, mapsetId] of mapsetIds.entries()) {
        const result = await importMapset(mapsetId);
        const status = result.success ? (result.note === "already_exists" ? "already imported" : "imported") : `failed: ${result.error}`;
        console.log(`[${index + 1}/${mapsetIds.length}] ${mapsetId} ${status}`);
        if (!result.success) failed.push(mapsetId);
    }

    console.log(`Done: ${mapsetIds.length - failed.length} ok, ${failed.length} failed${failed.length ? ` (${failed.join(", ")})` : ""}.`);
    if (failed.length) process.exitCode = 1;
}

try {
    await main();
} finally {
    await prisma.$disconnect();
}
