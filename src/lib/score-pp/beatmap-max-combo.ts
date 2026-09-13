import { env } from "@/lib/env";

export async function getBeatmapMaxCombo(beatmapId: number): Promise<number | null> {
    try {
        const response = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${env.OSU_API_KEY}&b=${beatmapId}`, {
            next: { revalidate: 86_400 },
            signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;

        const data: unknown = await response.json();
        if (!Array.isArray(data)) return null;
        const beatmap = data.find((entry) => entry && Number(entry.beatmap_id) === beatmapId);
        const maxCombo = Number(beatmap?.max_combo);
        return Number.isSafeInteger(maxCombo) && maxCombo > 0 ? maxCombo : null;
    } catch {
        return null;
    }
}
