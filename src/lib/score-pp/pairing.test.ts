import { describe, expect, test } from "bun:test";
import { generateScorePpPair } from "./pairing";
import type { ScorePpMetadataSource, ScorePpScoreSource, ScorePpSourceScore } from "./source";
import type { ScorePpBeatmapSnapshot, ScorePpPlayerSnapshot, ScorePpScoreSnapshot } from "./types";

function score(id: string, userId: number, beatmapId: number, pp: number): ScorePpSourceScore {
    return {
        sourceScoreId: id,
        userId,
        beatmapId,
        mods: [],
        score: "1000000",
        accuracy: 0.99,
        maxCombo: 1000,
        statistics: { great: 1000, ok: 10, meh: 0, miss: 0 },
        pp,
        endedAt: "2026-01-01T00:00:00Z",
    };
}

class FakeSource implements ScorePpScoreSource {
    constructor(private readonly scores: Map<number, ScorePpSourceScore[]>) {}

    async getRandomCandidateUserIds(): Promise<number[]> {
        return [...this.scores.keys()];
    }

    async getTopScores(userId: number, limit: number): Promise<ScorePpSourceScore[]> {
        return (this.scores.get(userId) ?? []).slice(0, limit);
    }

    async close(): Promise<void> {}
}

class FakeMetadata implements ScorePpMetadataSource {
    constructor(private readonly ranks: Map<number, number>) {}

    async getPlayer(userId: number): Promise<ScorePpPlayerSnapshot | null> {
        const globalRank = this.ranks.get(userId);
        if (!globalRank) return null;
        return { userId, username: `user-${userId}`, avatarUrl: `https://a.ppy.sh/${userId}`, globalRank };
    }

    async getBeatmap(beatmapId: number): Promise<ScorePpBeatmapSnapshot> {
        return {
            beatmapId,
            beatmapsetId: beatmapId + 1000,
            artist: "artist",
            title: `map-${beatmapId}`,
            difficultyName: "Insane",
            starRating: 6,
            backgroundUrl: "https://example.com/bg.jpg",
            beatmapUrl: `https://osu.ppy.sh/beatmaps/${beatmapId}`,
        };
    }

    async enrichScore(source: ScorePpSourceScore, player?: ScorePpPlayerSnapshot): Promise<ScorePpScoreSnapshot | null> {
        const resolvedPlayer = player ?? (await this.getPlayer(source.userId));
        if (!resolvedPlayer) return null;
        return {
            ...source,
            player: resolvedPlayer,
            beatmap: await this.getBeatmap(source.beatmapId),
        };
    }
}

describe("Score PP pairing", () => {
    test("selects another top-10k player with a score inside the round gap", async () => {
        const source = new FakeSource(
            new Map([
                [1, [score("a", 1, 101, 400)]],
                [2, [score("b", 2, 202, 320), score("c", 2, 203, 390)]],
                [3, [score("d", 3, 204, 399)]],
            ]),
        );
        const metadata = new FakeMetadata(
            new Map([
                [1, 500],
                [2, 8000],
                [3, 15000],
            ]),
        );

        const pair = await generateScorePpPair(source, metadata, 4, { rng: () => 0 });

        expect(pair).not.toBeNull();
        expect(new Set([pair?.left.player.userId, pair?.right.player.userId])).toEqual(new Set([1, 2]));
        expect(new Set([pair?.left.sourceScoreId, pair?.right.sourceScoreId])).toEqual(new Set(["a", "c"]));
        expect(pair?.relativePpGap).toBeCloseTo(0.025);
    });

    test("honors score, player, and beatmap exclusions", async () => {
        const source = new FakeSource(
            new Map([
                [1, [score("a", 1, 101, 500)]],
                [2, [score("b", 2, 202, 490)]],
                [4, [score("c", 4, 303, 495)]],
            ]),
        );
        const metadata = new FakeMetadata(
            new Map([
                [1, 10],
                [2, 20],
                [4, 30],
            ]),
        );

        const pair = await generateScorePpPair(source, metadata, 13, {
            rng: () => 0,
            exclusions: {
                userIds: new Set([2]),
                beatmapIds: new Set([202]),
                scoreIds: new Set(["b"]),
            },
        });

        expect(pair).not.toBeNull();
        expect(new Set([pair?.left.player.userId, pair?.right.player.userId])).toEqual(new Set([1, 4]));
    });
});
