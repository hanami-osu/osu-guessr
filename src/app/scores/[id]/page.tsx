import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/database/prisma";
import { ArrowLeft, Check, Clock3, ExternalLink, X } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/social-metadata";
import { getTranslations, isLocale } from "@/lib/translations";
import { cache } from "react";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ lobby?: string | string[] }>;
}

function asSnapshot(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string | undefined {
    const value = snapshot[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatMode(mode: string): string {
    const normalized = mode.replaceAll("_", " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatResult(result: string): string {
    return result.charAt(0).toUpperCase() + result.slice(1).replaceAll("_", " ");
}

type ScorePpReviewScore = {
    sourceScoreId: string;
    player: {
        userId: number;
        username: string;
        globalRank: number | null;
    };
    beatmap: {
        beatmapId: number;
        beatmapsetId: number;
        artist: string;
        title: string;
        difficultyName: string;
        starRating: number;
        maxCombo: number | null;
        beatmapUrl: string;
    };
    mods: string[];
    score: string;
    accuracy: number;
    maxCombo: number;
    statistics: {
        great?: number;
        ok?: number;
        meh?: number;
        miss: number;
    };
    pp: number;
};

type ScorePpReview = {
    left: ScorePpReviewScore;
    right: ScorePpReviewScore;
    selectedScoreId: string | null;
    higherScoreId: string;
};

type ReviewTranslations = ReturnType<typeof getTranslations>;

function snapshotNumber(snapshot: Record<string, unknown>, key: string): number | undefined {
    const value = snapshot[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asScorePpReviewScore(value: unknown): ScorePpReviewScore | null {
    const score = asSnapshot(value);
    const player = asSnapshot(score.player);
    const beatmap = asSnapshot(score.beatmap);
    const statistics = asSnapshot(score.statistics);
    const sourceScoreId = snapshotText(score, "sourceScoreId");
    const userId = snapshotNumber(player, "userId");
    const username = snapshotText(player, "username");
    const beatmapId = snapshotNumber(beatmap, "beatmapId");
    const beatmapsetId = snapshotNumber(beatmap, "beatmapsetId");
    const artist = snapshotText(beatmap, "artist");
    const title = snapshotText(beatmap, "title");
    const difficultyName = snapshotText(beatmap, "difficultyName");
    const starRating = snapshotNumber(beatmap, "starRating");
    const beatmapUrl = snapshotText(beatmap, "beatmapUrl");
    const scoreValue = snapshotText(score, "score");
    const accuracy = snapshotNumber(score, "accuracy");
    const maxCombo = snapshotNumber(score, "maxCombo");
    const miss = snapshotNumber(statistics, "miss");
    const pp = snapshotNumber(score, "pp");

    if (
        !sourceScoreId ||
        userId === undefined ||
        !username ||
        beatmapId === undefined ||
        beatmapsetId === undefined ||
        !artist ||
        !title ||
        !difficultyName ||
        starRating === undefined ||
        !beatmapUrl ||
        !scoreValue ||
        accuracy === undefined ||
        maxCombo === undefined ||
        miss === undefined ||
        pp === undefined
    ) {
        return null;
    }

    const globalRank = player.globalRank === null ? null : snapshotNumber(player, "globalRank") ?? null;
    const maxBeatmapCombo = beatmap.maxCombo === null ? null : snapshotNumber(beatmap, "maxCombo") ?? null;
    const mods = Array.isArray(score.mods) ? score.mods.filter((mod): mod is string => typeof mod === "string") : [];

    return {
        sourceScoreId,
        player: { userId, username, globalRank },
        beatmap: { beatmapId, beatmapsetId, artist, title, difficultyName, starRating, maxCombo: maxBeatmapCombo, beatmapUrl },
        mods,
        score: scoreValue,
        accuracy,
        maxCombo,
        statistics: {
            great: snapshotNumber(statistics, "great"),
            ok: snapshotNumber(statistics, "ok"),
            meh: snapshotNumber(statistics, "meh"),
            miss,
        },
        pp,
    };
}

function asScorePpReview(snapshot: Record<string, unknown>): ScorePpReview | null {
    const left = asScorePpReviewScore(snapshot.left);
    const right = asScorePpReviewScore(snapshot.right);
    const higherScoreId = snapshotText(snapshot, "higherScoreId");

    if (!left || !right || !higherScoreId || ![left.sourceScoreId, right.sourceScoreId].includes(higherScoreId)) return null;

    const selectedValue = snapshot.selectedScoreId;
    const selectedScoreId = typeof selectedValue === "string" ? selectedValue : null;

    return { left, right, selectedScoreId, higherScoreId };
}

const findGameByRouteId = cache(async (id: string) => {
    if (/^\d+$/.test(id)) {
        return prisma.game.findUnique({ where: { id: BigInt(id) } });
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return prisma.game.findUnique({ where: { sessionId: id } });
    }
    return null;
});

const findUserByBanchoId = cache((banchoId: number) => prisma.user.findUnique({ where: { banchoId } }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    try {
        const game = await findGameByRouteId(id);
        if (!game) {
            return createPageMetadata({
                title: "Score",
                description: "Detailed osu!guessr score and round history.",
                path: `/scores/${id}`,
            });
        }

        const user = await findUserByBanchoId(game.userId);
        const username = user?.username ?? `User ${game.userId}`;
        const roundsPlayed = game.roundsPlayed || 0;
        const accuracy = roundsPlayed > 0 ? (game.correctCount / roundsPlayed) * 100 : 0;
        const descriptionParts = [
            `${formatMode(game.gameMode)} · ${formatMode(game.variant)}`,
            game.ppVersion > 0 ? `${Number(game.pp).toLocaleString("en-US", { maximumFractionDigits: 1 })} pp` : null,
            roundsPlayed > 0 ? `${accuracy.toLocaleString("en-US", { maximumFractionDigits: 1 })}% accuracy` : null,
            `${game.points.toLocaleString("en-US")} points`,
        ].filter(Boolean);

        return createPageMetadata({
            title: `${username}'s score`,
            description: descriptionParts.join(" · "),
            path: `/scores/${game.id.toString()}`,
            image: user?.avatarUrl ?? "/main_bg.webp",
            imageAlt: user ? `${username}'s avatar` : "osu!guessr",
        });
    } catch {
        return createPageMetadata({
            title: "Score",
            description: "Detailed osu!guessr score and round history.",
            path: `/scores/${id}`,
        });
    }
}

export default async function ScorePage({ params, searchParams }: Props) {
    const [{ id }, query] = await Promise.all([params, searchParams]);
    const rawLobby = Array.isArray(query.lobby) ? query.lobby[0] : query.lobby;
    const lobbyCode = rawLobby && /^[A-Z0-9]{6,8}$/i.test(rawLobby) ? rawLobby.toUpperCase() : null;

    const game = await findGameByRouteId(id);
    if (game && !/^\d+$/.test(id)) redirect(`/scores/${game.id.toString()}${lobbyCode ? `?lobby=${encodeURIComponent(lobbyCode)}` : ""}`);

    if (!game) notFound();

    const [user, rounds, cookieStore] = await Promise.all([
        findUserByBanchoId(game.userId),
        prisma.gameRound.findMany({ where: { gameId: game.id }, orderBy: { roundNumber: "asc" } }),
        cookies(),
    ]);

    const localeCookie = cookieStore.get("locale")?.value;
    const locale = isLocale(localeCookie) ? localeCookie : "en";
    const t = getTranslations(locale);
    const roundsPlayed = game.roundsPlayed || rounds.length;
    const accuracy = roundsPlayed > 0 ? (game.correctCount / roundsPlayed) * 100 : 0;
    const averageResponseSeconds = roundsPlayed > 0 ? Number(game.totalResponseTimeMs) / roundsPlayed / 1000 : 0;
    const hasPp = game.ppVersion > 0;
    const isDeath = game.variant === "death";
    const isSurvival = game.variant === "survival";
    const isScorePp = game.gameMode === "score_pp";
    const modeLabel = isScorePp ? t.game.preGame.title.score_pp : formatMode(game.gameMode);
    const mistakes = Math.max(0, roundsPlayed - game.correctCount);

    return (
        <div className="page-container py-6 md:py-10">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    {lobbyCode && (
                        <Button asChild size="sm">
                            <Link href={`/multiplayer/${lobbyCode}`}>
                                <ArrowLeft className="mr-2 size-4" />
                                Back to lobby
                            </Link>
                        </Button>
                    )}
                    <Button asChild variant="ghost" size="sm">
                        <Link href={`/user/${game.userId}?mode=${game.gameMode}&variant=${game.variant}`}>
                            <ArrowLeft className="mr-2 size-4" />
                            Back to profile
                        </Link>
                    </Button>
                </div>
                <div className="text-xs text-muted-foreground">Score #{game.id.toString()}</div>
            </div>

            <section className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <div className="border-b border-border/60 px-5 py-5 sm:px-7">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-sm text-muted-foreground">
                                {modeLabel} · {formatMode(game.variant)} · {game.endedAt.toLocaleString(locale)}
                            </div>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{user?.username ?? `User ${game.userId}`}&apos;s score</h1>
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">{isScorePp ? t.game.scorePp.pp : "pp"}</div>
                            <div className={`mt-1 text-3xl font-bold tabular-nums ${hasPp ? "text-primary" : "text-muted-foreground"}`}>
                                {hasPp ? `${Number(game.pp).toLocaleString(undefined, { maximumFractionDigits: 1 })} pp` : "Legacy"}
                            </div>
                        </div>
                    </div>
                </div>

                {isDeath ? (
                    <dl className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        <ScoreStat label="Total Points" value={game.points.toLocaleString()} />
                        <ScoreStat label="Best Streak" value={`${game.streak}x`} />
                        <ScoreStat label="Avg. Response" value={`${averageResponseSeconds.toFixed(1)}s`} />
                    </dl>
                ) : isSurvival ? (
                    <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
                        <ScoreStat label="Total Points" value={game.points.toLocaleString()} />
                        <ScoreStat label="Correct" value={`${game.correctCount}/${roundsPlayed}`} />
                        <ScoreStat label="Lives Lost" value={mistakes.toString()} />
                        <ScoreStat label="Best Streak" value={`${game.streak}x`} />
                        <ScoreStat label="Avg. Response" value={`${averageResponseSeconds.toFixed(1)}s`} />
                    </dl>
                ) : (
                    <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
                        <ScoreStat label="Total Points" value={game.points.toLocaleString()} />
                        <ScoreStat label="Correct" value={`${game.correctCount}/${roundsPlayed}`} />
                        <ScoreStat label="Accuracy" value={`${accuracy.toFixed(1)}%`} />
                        <ScoreStat label="Best Streak" value={`${game.streak}x`} />
                        <ScoreStat label="Avg. Response" value={`${averageResponseSeconds.toFixed(1)}s`} />
                    </dl>
                )}
            </section>


            <section className="mt-8">
                <div className="mb-3 flex items-center gap-2 px-1">
                    <span aria-hidden="true" className="h-4 w-[3px] rounded-full bg-primary" />
                    <h2 className="text-base font-semibold">{isScorePp ? t.game.scorePp.results.comparedPlays : "Guesses"}</h2>
                </div>

                {rounds.length === 0 ? (
                    <div className="rounded-xl bg-muted/35 px-5 py-8 text-sm text-muted-foreground">Round details are unavailable for this legacy score.</div>
                ) : (
                    <div className="space-y-2">
                        {rounds.map((round) => {
                            const snapshot = asSnapshot(round.contentSnapshot);
                            if (isScorePp && round.itemType === "score_pair") {
                                const review = asScorePpReview(snapshot);

                                if (!review) {
                                    return (
                                        <article key={round.id.toString()} className="rounded-xl bg-muted/45 px-4 py-5 text-sm text-muted-foreground md:px-5">
                                            {t.game.scorePp.results.reviewUnavailable}
                                        </article>
                                    );
                                }

                                return (
                                    <ScorePpReviewRound
                                        key={round.id.toString()}
                                        roundNumber={round.roundNumber}
                                        resultType={round.resultType}
                                        correct={round.correct}
                                        pointsEarned={round.pointsEarned}
                                        responseTimeMs={round.responseTimeMs}
                                        streakAfter={round.streakAfter}
                                        left={review.left}
                                        right={review.right}
                                        selectedScoreId={review.selectedScoreId}
                                        higherScoreId={review.higherScoreId}
                                        locale={locale}
                                        t={t}
                                    />
                                );
                            }

                            const title = snapshotText(snapshot, "title") ?? snapshotText(snapshot, "name") ?? round.answerSnapshot;
                            const artist = snapshotText(snapshot, "artist");
                            const mapper = snapshotText(snapshot, "mapper");
                            const submitted =
                                round.resultType === "skip" ? "Skipped" : round.resultType === "timeout" ? "Timed out" : round.submittedGuess?.trim() || "No guess";

                            return (
                                <article key={round.id.toString()} className="grid gap-4 rounded-xl bg-muted/45 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8 md:px-5">
                                    <div className="min-w-0">
                                        <div className="mb-1 text-xs font-medium text-muted-foreground">Round {round.roundNumber}</div>
                                        <div className="flex items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium text-foreground">{title}</div>
                                                {(artist || mapper) && (
                                                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                                        {[artist, mapper ? `mapped by ${mapper}` : null].filter(Boolean).join(" · ")}
                                                    </div>
                                                )}
                                            </div>
                                            {round.itemType === "mapset" && (
                                                <Link
                                                    href={`https://osu.ppy.sh/beatmapsets/${round.itemId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                                                    aria-label="Open beatmapset on osu!"
                                                >
                                                    <ExternalLink className="size-4" />
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    <div className="min-w-0 border-t border-border/50 pt-3 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
                                            <div className="text-xs font-medium text-muted-foreground">Your guess</div>
                                            <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${round.correct ? "text-emerald-500" : round.resultType === "skip" ? "text-warning" : "text-destructive"}`}>
                                                {round.correct ? <Check className="size-4" /> : <X className="size-4" />}
                                                {round.correct ? "Correct" : round.resultType === "guess" ? "Incorrect" : formatResult(round.resultType)}
                                            </div>
                                            <div className={`col-span-2 line-clamp-2 min-h-10 break-words font-medium ${round.resultType === "skip" ? "text-warning" : ""}`}>{submitted}</div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                            <span className="inline-flex items-center gap-1.5">
                                                <Clock3 className="size-3.5" />
                                                {(round.responseTimeMs / 1000).toFixed(1)}s
                                            </span>
                                            <span className="tabular-nums">{round.pointsEarned >= 0 ? "+" : ""}{round.pointsEarned.toLocaleString()} points</span>
                                            <span className="tabular-nums">{round.streakAfter}x streak</span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}

function ScorePpReviewRound({
    roundNumber,
    resultType,
    correct,
    pointsEarned,
    responseTimeMs,
    streakAfter,
    left,
    right,
    selectedScoreId,
    higherScoreId,
    locale,
    t,
}: {
    roundNumber: number;
    resultType: string;
    correct: boolean;
    pointsEarned: number;
    responseTimeMs: number;
    streakAfter: number;
    left: ScorePpReviewScore;
    right: ScorePpReviewScore;
    selectedScoreId: string | null;
    higherScoreId: string;
    locale: string;
    t: ReviewTranslations;
}) {
    const resultLabel = resultType === "skip" ? t.game.result.skipped : resultType === "timeout" ? t.game.scorePp.timeUp : correct ? t.game.scorePp.correct : t.game.scorePp.wrong;
    const resultClass = correct ? "text-success" : resultType === "skip" ? "text-warning" : "text-destructive";

    return (
        <article className="space-y-3 rounded-xl bg-muted/45 px-4 py-4 md:px-5">
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">{t.game.scorePp.results.round.replace("{round}", roundNumber.toString())}</div>
                <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${resultClass}`} role="status" aria-live="polite">
                    {correct ? <Check className="size-4" /> : <X className="size-4" />}
                    {resultLabel}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <ScorePpReviewCard score={left} side="A" selected={selectedScoreId === left.sourceScoreId} winner={higherScoreId === left.sourceScoreId} locale={locale} t={t} />
                <ScorePpReviewCard score={right} side="B" selected={selectedScoreId === right.sourceScoreId} winner={higherScoreId === right.sourceScoreId} locale={locale} t={t} />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {(responseTimeMs / 1000).toFixed(1)}s
                </span>
                <span className="tabular-nums">{pointsEarned >= 0 ? "+" : ""}{pointsEarned.toLocaleString(locale)} points</span>
                <span className="tabular-nums">{streakAfter}x streak</span>
            </div>
        </article>
    );
}

function ScorePpReviewCard({
    score,
    side,
    selected,
    winner,
    locale,
    t,
}: {
    score: ScorePpReviewScore;
    side: "A" | "B";
    selected: boolean;
    winner: boolean;
    locale: string;
    t: ReviewTranslations;
}) {
    const cardClass = winner
        ? "border-success/70 bg-success/[0.045]"
        : selected
          ? "border-destructive/70 bg-destructive/[0.045]"
          : "border-border/50 bg-background/20";

    return (
        <article className={`min-w-0 border px-3 py-3 ${cardClass}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.game.scorePp.results.scoreSide.replace("{side}", side)}</div>
                    <div className="mt-1 truncate font-semibold text-foreground">{score.player.username}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{score.beatmap.artist} - {score.beatmap.title} [{score.beatmap.difficultyName}]</div>
                </div>
                <div className="shrink-0 text-right">
                    <div className={`font-mono text-xl font-bold tabular-nums ${winner ? "text-success" : "text-foreground"}`}>
                        {score.pp.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}pp
                    </div>
                    <div className="mt-1 flex justify-end gap-1 text-[10px] font-semibold uppercase tracking-wide">
                        {selected && (
                            <span className={`${winner ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"} px-1.5 py-0.5`}>
                                {t.game.scorePp.results.yourPick}
                            </span>
                        )}
                        {winner && !selected && <span className="bg-success/15 px-1.5 py-0.5 text-success">{t.game.scorePp.results.winningChoice}</span>}
                    </div>
                </div>
            </div>
        </article>
    );
}

function ScoreStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-4 py-4 sm:px-5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
        </div>
    );
}
