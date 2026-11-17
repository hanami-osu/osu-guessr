"use server";

import { z } from "zod";
import { GameMode } from "@/actions/types";
import { requireAdmin } from "@/actions/require-admin";
import { createManualDailyChallenge } from "@/lib/game/mapsets";
import { parseFutureDailyDate } from "@/lib/game/daily";
import { createManualScorePpDailyChallenge } from "@/lib/score-pp/server";
import { query } from "@/lib/database";
import { prisma } from "@/lib/database/prisma";

const inputSchema = z.object({
    dateText: z.string(),
    gameMode: z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp]),
    ignoreRepetitionChecks: z.boolean(),
    selectedItemIds: z.array(z.coerce.number().int().positive()).length(5),
    overwrite: z.boolean().default(false),
});

export async function searchManualDailyContent(rawGameMode: string, searchText: string): Promise<Array<{ id: number; label: string }>> {
    await requireAdmin();
    const gameMode = z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp]).parse(rawGameMode);
    const search = z.string().trim().min(2).max(100).parse(searchText).toLocaleLowerCase();
    const like = `%${search}%`;

    if (gameMode === GameMode.Background || gameMode === GameMode.Audio) {
        const mediaColumn = gameMode === GameMode.Audio ? "mt.audio_filename" : "mt.image_filename";
        return query<{ id: number; label: string }>(
            `SELECT md.mapset_id AS id, CONCAT(md.artist, ' - ', md.title, ' (', md.mapper, ')') AS label
             FROM mapset_data AS md
             INNER JOIN mapset_tags AS mt ON mt.mapset_id = md.mapset_id
             WHERE ${mediaColumn} IS NOT NULL AND ${mediaColumn} <> ''
               AND (LOWER(md.artist) LIKE ? OR LOWER(md.title) LIKE ? OR CAST(md.mapset_id AS CHAR) = ?)
             ORDER BY md.artist, md.title LIMIT 30`,
            [like, like, search],
        );
    }

    if (gameMode === GameMode.Skin) {
        return query<{ id: number; label: string }>(
            `SELECT id, name AS label FROM skins
             WHERE image_filename IS NOT NULL AND image_filename <> ''
               AND (LOWER(name) LIKE ? OR CAST(id AS CHAR) = ?)
             ORDER BY name LIMIT 30`,
            [like, search],
        );
    }

    const batch = await prisma.scorePpBatch.findFirst({ where: { status: "active" }, orderBy: { activatedAt: "desc" }, select: { id: true } });
    if (!batch) return [];
    return query<{ id: number; label: string }>(
        `SELECT id, CONCAT(
             JSON_UNQUOTE(JSON_EXTRACT(left_snapshot, '$.player.username')), ' vs ',
             JSON_UNQUOTE(JSON_EXTRACT(right_snapshot, '$.player.username')), ' | ',
             JSON_UNQUOTE(JSON_EXTRACT(left_snapshot, '$.beatmap.artist')), ' - ',
             JSON_UNQUOTE(JSON_EXTRACT(left_snapshot, '$.beatmap.title')), ' vs ',
             JSON_UNQUOTE(JSON_EXTRACT(right_snapshot, '$.beatmap.artist')), ' - ',
             JSON_UNQUOTE(JSON_EXTRACT(right_snapshot, '$.beatmap.title'))
           ) AS label
         FROM score_pp_pairs
         WHERE batch_id = ? AND active = TRUE
           AND LOWER(CONCAT(
             JSON_UNQUOTE(JSON_EXTRACT(left_snapshot, '$.player.username')), ' ',
             JSON_UNQUOTE(JSON_EXTRACT(right_snapshot, '$.player.username')), ' ',
             JSON_UNQUOTE(JSON_EXTRACT(left_snapshot, '$.beatmap.title')), ' ',
             JSON_UNQUOTE(JSON_EXTRACT(right_snapshot, '$.beatmap.title'))
           )) LIKE ?
         ORDER BY id DESC LIMIT 30`,
        [batch.id, like],
    );
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
