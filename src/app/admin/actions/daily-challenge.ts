"use server";

import { z } from "zod";
import { GameMode } from "@/actions/types";
import { requireAdmin } from "@/actions/require-admin";
import { createManualDailyChallenge } from "@/lib/game/mapsets";
import { parseFutureDailyDate } from "@/lib/game/daily";
import { createManualScorePpDailyChallenge } from "@/lib/score-pp/server";
import type { ScorePpScoreSnapshot } from "@/lib/score-pp/types";
import { prisma } from "@/lib/database/prisma";

const inputSchema = z.object({
    dateText: z.string(),
    gameMode: z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp]),
    ignoreRepetitionChecks: z.boolean(),
    selectedItemIds: z.array(z.coerce.number().int().positive()).length(5),
    overwrite: z.boolean().default(false),
});

function matchesScoreSearch(text: string, search: string): boolean {
    // Preserve the case-insensitive LIKE wildcards from the database search.
    const candidate = text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
    const pattern = search.normalize("NFD").replace(/\p{M}/gu, "");
    if (!/[%_\\]/.test(pattern)) return candidate.includes(pattern);

    const characters = [...candidate];
    let matches = Array<boolean>(characters.length + 1).fill(true);
    for (const token of pattern.match(/\\[\s\S]|[\s\S]/gu) ?? []) {
        const literal = token.startsWith("\\") && token.length > 1 ? token.slice(1) : token;
        const next = [token === "%" && matches[0]];
        for (const [index, character] of characters.entries()) {
            next.push(token === "%" ? next[index] || matches[index + 1] : matches[index] && (token === "_" || literal === character));
        }
        matches = next;
    }
    return matches.some(Boolean);
}

export async function searchManualDailyContent(rawGameMode: string, searchText: string): Promise<Array<{ id: number; label: string }>> {
    await requireAdmin();
    const gameMode = z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp]).parse(rawGameMode);
    const search = z.string().trim().min(2).max(100).parse(searchText).toLocaleLowerCase();
    const id = /^[1-9]\d*$/.test(search) && Number(search) <= 2_147_483_647 ? Number(search) : undefined;

    if (gameMode === GameMode.Background || gameMode === GameMode.Audio) {
        const media = gameMode === GameMode.Audio ? "audioFilename" : "imageFilename";
        const rows = await prisma.mapsetData.findMany({
            where: {
                tag: { is: { [media]: { not: "" } } },
                OR: [{ artist: { contains: search } }, { title: { contains: search } }, ...(id === undefined ? [] : [{ mapsetId: id }])],
            },
            select: { mapsetId: true, artist: true, title: true, mapper: true },
            orderBy: [{ artist: "asc" }, { title: "asc" }, { mapsetId: "asc" }],
            take: 30,
        });
        return rows.map(({ mapsetId, artist, title, mapper }) => ({ id: mapsetId, label: `${artist ?? ""} - ${title ?? ""} (${mapper ?? ""})` }));
    }

    if (gameMode === GameMode.Skin) {
        const rows = await prisma.skin.findMany({
            where: { imageFilename: { not: "" }, OR: [{ name: { contains: search } }, ...(id === undefined ? [] : [{ id }])] },
            select: { id: true, name: true },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            take: 30,
        });
        return rows.map(({ id, name }) => ({ id, label: name }));
    }

    const batch = await prisma.scorePpBatch.findFirst({ where: { status: "active" }, orderBy: { activatedAt: "desc" }, select: { id: true } });
    if (!batch) return [];
    const matches: Array<{ id: number; label: string }> = [];
    const batchSize = 500;
    let before: number | undefined;
    while (matches.length < 30) {
        const rows = await prisma.scorePpPair.findMany({
            where: { batchId: batch.id, active: true, ...(before === undefined ? {} : { id: { lt: before } }) },
            select: { id: true, leftSnapshot: true, rightSnapshot: true },
            orderBy: { id: "desc" },
            take: batchSize,
        });
        for (const row of rows) {
            const left = row.leftSnapshot as ScorePpScoreSnapshot | null;
            const right = row.rightSnapshot as ScorePpScoreSnapshot | null;
            if (!left?.player || !left.beatmap || !right?.player || !right.beatmap) continue;
            const searchable = `${left.player.username} ${right.player.username} ${left.beatmap.title} ${right.beatmap.title}`;
            if (!matchesScoreSearch(searchable, search)) continue;
            matches.push({ id: row.id, label: `${left.player.username} vs ${right.player.username} | ${left.beatmap.artist} - ${left.beatmap.title} vs ${right.beatmap.artist} - ${right.beatmap.title}` });
            if (matches.length === 30) break;
        }
        if (rows.length < batchSize) break;
        before = rows[rows.length - 1].id;
    }
    return matches;
}

export async function setManualDailyChallenge(dateText: string, rawGameMode: string, rawIgnoreRepetitionChecks: boolean, selectedItemIds: number[], overwrite = false): Promise<string> {
    await requireAdmin();
    const input = inputSchema.parse({ dateText, gameMode: rawGameMode, ignoreRepetitionChecks: rawIgnoreRepetitionChecks, selectedItemIds, overwrite });
    const date = parseFutureDailyDate(input.dateText);
    if (input.gameMode === GameMode.ScorePp) {
        await createManualScorePpDailyChallenge(date, input.selectedItemIds, input.overwrite);
    } else {
        await createManualDailyChallenge(date, input.gameMode, input.ignoreRepetitionChecks, input.selectedItemIds, input.overwrite);
    }
    return `Set the ${input.gameMode} daily challenge for ${date.toISOString().slice(0, 10)}.`;
}
