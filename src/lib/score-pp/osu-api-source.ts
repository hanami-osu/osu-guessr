import { tmpdir } from "node:os";
import { join } from "node:path";
import { auth, v2 } from "osu-api-extended";
import type { ScorePpMetadataSource, ScorePpScoreSource, ScorePpSourceScore } from "./source";
import type { ScorePpBeatmapSnapshot, ScorePpPlayerSnapshot, ScorePpScoreSnapshot } from "./types";
import { shuffle } from "./random";

const RANKING_PAGE_SIZE = 50;
const MAX_RANKING_PAGE = 200;
const USER_BEST_PAGE_SIZE = 100;
const MAX_RANKING_CANDIDATES = 1_100;

type UserBestParams = {
    type: "user_best";
    user_id: number;
    mode: "osu";
    include_fails: false;
    offset: number;
    limit: number;
};

type UserBestList = (params: UserBestParams) => Promise<Array<Record<string, unknown>> & { error?: unknown }>;

function getApiError(value: unknown): Error | null {
    if (!value || typeof value !== "object" || !("error" in value)) return null;
    const error = (value as { error?: unknown }).error;
    if (!error) return null;
    return error instanceof Error ? error : new Error(String(error));
}

function mapMods(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((mod) => {
        if (typeof mod === "string") return [mod];
        if (mod && typeof mod === "object" && "acronym" in mod && typeof mod.acronym === "string") return [mod.acronym];
        return [];
    });
}

function numberField(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function objectField(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mapBeatmap(score: Record<string, unknown>): ScorePpBeatmapSnapshot | null {
    const beatmap = objectField(score.beatmap);
    const beatmapset = objectField(score.beatmapset);
    if (!beatmap || !beatmapset) return null;

    const beatmapId = numberField(beatmap.id);
    const beatmapsetId = numberField(beatmapset.id);
    const artist = stringField(beatmapset.artist);
    const title = stringField(beatmapset.title);
    const difficultyName = stringField(beatmap.version);
    const starRating = numberField(beatmap.difficulty_rating);
    if (!beatmapId || !beatmapsetId || !artist || !title || !difficultyName || starRating == null) return null;

    const covers = objectField(beatmapset.covers);
    const backgroundUrl = stringField(covers?.cover) ?? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/cover.jpg`;

    return {
        beatmapId,
        beatmapsetId,
        artist,
        title,
        difficultyName,
        starRating,
        maxCombo: numberField(beatmap.max_combo),
        backgroundUrl,
        beatmapUrl: `https://osu.ppy.sh/beatmapsets/${beatmapsetId}#osu/${beatmapId}`,
    };
}

function mapSourceScore(score: Record<string, unknown>): { source: ScorePpSourceScore; beatmap: ScorePpBeatmapSnapshot } | null {
    const sourceScoreId = numberField(score.id);
    const userId = numberField(score.user_id);
    const beatmapId = numberField(score.beatmap_id);
    const pp = numberField(score.pp);
    const accuracy = numberField(score.accuracy);
    const maxCombo = numberField(score.max_combo);
    const rulesetId = numberField(score.ruleset_id);
    const endedAt = stringField(score.ended_at);
    const beatmap = mapBeatmap(score);
    const beatmapData = objectField(score.beatmap);
    const statistics = objectField(score.statistics) ?? {};
    const status = stringField(beatmapData?.status);

    if (!sourceScoreId || !userId || !beatmapId || !pp || accuracy == null || maxCombo == null || rulesetId !== 0 || !endedAt || !beatmap || !["ranked", "approved"].includes(status ?? "")) {
        return null;
    }

    const classicScore = numberField(score.classic_total_score);
    const legacyScore = numberField(score.legacy_total_score);
    const totalScore = numberField(score.total_score);

    return {
        source: {
            sourceScoreId: String(sourceScoreId),
            userId,
            beatmapId,
            mods: mapMods(score.mods),
            score: String(classicScore || legacyScore || totalScore || 0),
            accuracy,
            maxCombo,
            statistics: {
                great: numberField(statistics.great) ?? numberField(statistics.count_300) ?? 0,
                ok: numberField(statistics.ok) ?? numberField(statistics.count_100) ?? 0,
                meh: numberField(statistics.meh) ?? numberField(statistics.count_50) ?? 0,
                miss: numberField(statistics.miss) ?? numberField(statistics.count_miss) ?? 0,
                perfect: numberField(statistics.perfect) ?? numberField(statistics.count_geki) ?? 0,
                good: numberField(statistics.good) ?? numberField(statistics.count_katu) ?? 0,
            },
            pp,
            endedAt,
        },
        beatmap,
    };
}

export class OsuApiScoreSource implements ScorePpScoreSource, ScorePpMetadataSource {
    private readonly players = new Map<number, ScorePpPlayerSnapshot | null>();
    private readonly beatmaps = new Map<number, ScorePpBeatmapSnapshot>();
    private readonly scoresByUser = new Map<number, ScorePpSourceScore[]>();
    private readonly rankingCandidateIds = new Set<number>();
    private readonly loadedRankingPages = new Set<number>();

    static async create(clientId: string, clientSecret: string): Promise<OsuApiScoreSource> {
        const result = await auth.login({
            type: "v2",
            client_id: clientId,
            client_secret: clientSecret,
            scopes: ["public"],
            cached_token_path: join(tmpdir(), "osu-guessr-score-pp-token.json"),
        });
        const error = getApiError(result);
        if (error) throw new Error(`osu! API authentication failed: ${error.message}`);
        return new OsuApiScoreSource();
    }

    async getRandomCandidateUserIds(limit: number): Promise<number[]> {
        const safeLimit = Math.max(1, Math.min(MAX_RANKING_CANDIDATES, Math.trunc(limit)));
        const targetPoolSize = safeLimit;

        while (this.rankingCandidateIds.size < targetPoolSize && this.loadedRankingPages.size < MAX_RANKING_PAGE) {
            let page = 1 + Math.floor(Math.random() * MAX_RANKING_PAGE);
            while (this.loadedRankingPages.has(page) && this.loadedRankingPages.size < MAX_RANKING_PAGE) {
                page = 1 + Math.floor(Math.random() * MAX_RANKING_PAGE);
            }
            this.loadedRankingPages.add(page);
            const response = await v2.ranking.list({ type: "performance", mode: "osu", page });
            const error = getApiError(response);
            if (error) throw new Error(`osu! performance ranking request failed: ${error.message}`);

            for (const entry of response.ranking ?? []) {
                if (!entry.user?.id || !entry.user.is_active || entry.global_rank < 1 || entry.global_rank > MAX_RANKING_PAGE * RANKING_PAGE_SIZE) continue;
                this.players.set(entry.user.id, {
                    userId: entry.user.id,
                    username: entry.user.username,
                    avatarUrl: entry.user.avatar_url,
                    globalRank: entry.global_rank,
                });
                this.rankingCandidateIds.add(entry.user.id);
            }
        }

        return shuffle([...this.rankingCandidateIds]).slice(0, safeLimit);
    }

    async getTopScores(userId: number, limit: number): Promise<ScorePpSourceScore[]> {
        const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
        const cached = this.scoresByUser.get(userId);
        if (cached && cached.length >= safeLimit) return cached.slice(0, safeLimit);

        const listUserBest = v2.scores.list as unknown as UserBestList;
        const scores: ScorePpSourceScore[] = [];
        const seen = new Set<string>();

        for (let offset = 0; offset < safeLimit; offset += USER_BEST_PAGE_SIZE) {
            const pageLimit = Math.min(USER_BEST_PAGE_SIZE, safeLimit - offset);
            const response = await listUserBest({
                type: "user_best",
                user_id: userId,
                mode: "osu",
                include_fails: false,
                offset,
                limit: pageLimit,
            });
            const error = getApiError(response);
            if (error) throw new Error(`osu! user best scores request failed: ${error.message}`);

            for (const raw of response) {
                const mapped = mapSourceScore(raw);
                if (!mapped || mapped.source.userId !== userId || seen.has(mapped.source.sourceScoreId)) continue;
                seen.add(mapped.source.sourceScoreId);
                this.beatmaps.set(mapped.beatmap.beatmapId, mapped.beatmap);
                scores.push(mapped.source);
            }

            if (response.length < pageLimit) break;
        }

        scores.sort((left, right) => right.pp - left.pp);
        this.scoresByUser.set(userId, scores);
        return scores.slice(0, safeLimit);
    }

    async getPlayer(userId: number): Promise<ScorePpPlayerSnapshot | null> {
        if (this.players.has(userId)) return this.players.get(userId) ?? null;

        const response = await v2.users.details({ user: userId, mode: "osu", key: "id" });
        const error = getApiError(response);
        if (error) throw new Error(`osu! user details request failed: ${error.message}`);

        const globalRank = response.statistics?.global_rank;
        const player = response.id
            ? {
                  userId: response.id,
                  username: response.username,
                  avatarUrl: response.avatar_url,
                  globalRank: typeof globalRank === "number" && globalRank > 0 ? globalRank : null,
              }
            : null;
        this.players.set(userId, player);
        return player;
    }

    async getBeatmap(beatmapId: number): Promise<ScorePpBeatmapSnapshot | null> {
        return this.beatmaps.get(beatmapId) ?? null;
    }

    async enrichScore(score: ScorePpSourceScore, player?: ScorePpPlayerSnapshot): Promise<ScorePpScoreSnapshot | null> {
        const resolvedPlayer = player ?? (await this.getPlayer(score.userId));
        const beatmap = await this.getBeatmap(score.beatmapId);
        if (!resolvedPlayer || !beatmap) return null;

        return {
            sourceScoreId: score.sourceScoreId,
            player: resolvedPlayer,
            beatmap,
            mods: score.mods,
            score: score.score,
            accuracy: score.accuracy,
            maxCombo: score.maxCombo,
            statistics: score.statistics,
            pp: score.pp,
            endedAt: score.endedAt,
        };
    }

    async close(): Promise<void> {}
}
