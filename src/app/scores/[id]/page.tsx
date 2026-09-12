import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/database/prisma";
import { ArrowLeft, Check, Clock3, ExternalLink, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/social-metadata";
import { cache } from "react";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ id: string }>;
}

function asSnapshot(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function snapshotText(snapshot: Record<string, unknown>, key: string): string | undefined {
    const value = snapshot[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatMode(mode: string): string {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function formatResult(result: string): string {
    return result.charAt(0).toUpperCase() + result.slice(1).replaceAll("_", " ");
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

export default async function ScorePage({ params }: Props) {
    const { id } = await params;

    const game = await findGameByRouteId(id);
    if (game && !/^\d+$/.test(id)) redirect(`/scores/${game.id.toString()}`);

    if (!game) notFound();

    const [user, rounds] = await Promise.all([
        findUserByBanchoId(game.userId),
        prisma.gameRound.findMany({ where: { gameId: game.id }, orderBy: { roundNumber: "asc" } }),
    ]);

    const roundsPlayed = game.roundsPlayed || rounds.length;
    const accuracy = roundsPlayed > 0 ? (game.correctCount / roundsPlayed) * 100 : 0;
    const averageResponseSeconds = roundsPlayed > 0 ? Number(game.totalResponseTimeMs) / roundsPlayed / 1000 : 0;
    const hasPp = game.ppVersion > 0;
    const isDeath = game.variant === "death";
    const isSurvival = game.variant === "survival";
    const mistakes = Math.max(0, roundsPlayed - game.correctCount);

    return (
        <main className="page-container py-6 md:py-10">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <Button asChild variant="ghost" size="sm">
                    <Link href={`/user/${game.userId}?mode=${game.gameMode}&variant=${game.variant}`}>
                        <ArrowLeft className="mr-2 size-4" />
                        Back to profile
                    </Link>
                </Button>
                <div className="text-xs text-muted-foreground">Score #{game.id.toString()}</div>
            </div>

            <section className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <div className="border-b border-border/60 px-5 py-5 sm:px-7">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-sm text-muted-foreground">
                                {formatMode(game.gameMode)} · {formatMode(game.variant)} · {game.endedAt.toLocaleString()}
                            </div>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{user?.username ?? `User ${game.userId}`}&apos;s score</h1>
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">pp</div>
                            <div className={`mt-1 text-3xl font-bold tabular-nums ${hasPp ? "text-primary" : "text-muted-foreground"}`}>
                                {hasPp ? `${Number(game.pp).toLocaleString(undefined, { maximumFractionDigits: 1 })} pp` : "Legacy"}
                            </div>
                        </div>
                    </div>
                </div>

                {isDeath ? (
                    <dl className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        <ScoreStat label="Total Points" value={game.points.toLocaleString()} />
                        <ScoreStat label="Streak" value={`${game.streak}x`} />
                        <ScoreStat label="Average Time" value={`${averageResponseSeconds.toFixed(1)}s`} />
                    </dl>
                ) : isSurvival ? (
                    <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
                        <ScoreStat label="Total Points" value={game.points.toLocaleString()} />
                        <ScoreStat label="Correct" value={`${game.correctCount}/${roundsPlayed}`} />
                        <ScoreStat label="Mistakes" value={mistakes.toString()} />
                        <ScoreStat label="Best Streak" value={`${game.streak}x`} />
                        <ScoreStat label="Average Time" value={`${averageResponseSeconds.toFixed(1)}s`} />
                    </dl>
                ) : (
                    <dl className="grid grid-cols-2 divide-x divide-y divide-border/60 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
                        <ScoreStat label="Total Points" value={game.points.toLocaleString()} />
                        <ScoreStat label="Correct" value={`${game.correctCount}/${roundsPlayed}`} />
                        <ScoreStat label="Accuracy" value={`${accuracy.toFixed(1)}%`} />
                        <ScoreStat label="Best Streak" value={`${game.streak}x`} />
                        <ScoreStat label="Average Time" value={`${averageResponseSeconds.toFixed(1)}s`} />
                    </dl>
                )}
            </section>


            <section className="mt-8">
                <div className="mb-3 flex items-center gap-2 px-1">
                    <span aria-hidden="true" className="h-4 w-[3px] rounded-full bg-primary" />
                    <h2 className="text-base font-semibold">Guesses</h2>
                </div>

                {rounds.length === 0 ? (
                    <div className="rounded-xl bg-muted/35 px-5 py-8 text-sm text-muted-foreground">Round details are unavailable for this legacy score.</div>
                ) : (
                    <div className="space-y-2">
                        {rounds.map((round) => {
                            const snapshot = asSnapshot(round.contentSnapshot);
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
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-medium text-muted-foreground">Your guess</div>
                                                <div className="mt-0.5 break-words font-medium">{submitted}</div>
                                            </div>
                                            <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${round.correct ? "text-emerald-500" : "text-destructive"}`}>
                                                {round.correct ? <Check className="size-4" /> : <X className="size-4" />}
                                                {round.correct ? "Correct" : round.resultType === "guess" ? "Incorrect" : formatResult(round.resultType)}
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
        </main>
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
