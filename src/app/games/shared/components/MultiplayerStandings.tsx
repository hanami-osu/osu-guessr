import Image from "next/image";
import { Check, SkipForward, Users, X } from "lucide-react";
import type { MultiplayerLobby } from "@/lib/multiplayer";

export default function MultiplayerStandings({
    lobby,
    presenceUserIds,
    currentUserId,
    currentRound,
}: {
    lobby?: MultiplayerLobby | null;
    presenceUserIds?: Set<number> | null;
    currentUserId?: number | null;
    currentRound?: number;
}) {
    if (!lobby || lobby.players.length === 0) return null;

    const roundParticipants = currentRound ? lobby.players.filter((player) => !player.finished || player.round >= currentRound) : [];
    const roundComplete = Boolean(currentRound && roundParticipants.length > 0 && roundParticipants.every((player) => player.submittedRound >= currentRound));
    const visiblePoints = (player: MultiplayerLobby["players"][number]) =>
        !roundComplete && currentRound && player.resultRound === currentRound ? player.points - player.resultPoints : player.points;
    const players = [...lobby.players].sort((a, b) => visiblePoints(b) - visiblePoints(a) || b.round - a.round || a.joinedAt.localeCompare(b.joinedAt));

    return (
        <section className="border-y border-border/60 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Users className="size-3.5 text-primary" />
                    Players
                </span>
                <span className="text-xs text-muted-foreground">{players.length}</span>
            </div>

            <div className="space-y-3">
                {players.map((player) => {
                    const offline = presenceUserIds ? !presenceUserIds.has(player.userId) : false;
                    const revealResult = Boolean(roundComplete && currentRound && player.resultRound === currentRound && player.resultCorrect !== null);
                    const status = revealResult
                        ? player.resultSkipped ? "Skipped" : player.resultCorrect ? "Correct" : "Incorrect"
                        : offline
                          ? "Offline"
                          : player.finished
                            ? "Finished"
                            : currentRound && player.submittedRound >= currentRound
                              ? `Answered round ${currentRound}`
                              : `Round ${Math.max(player.round, 1)}`;

                    return (
                        <div key={player.userId} className="flex items-center gap-2.5">
                            <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted">
                                <Image src={player.avatarUrl || "/default-avatar.svg"} alt="" fill unoptimized sizes="32px" className="object-cover" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                    {player.username}
                                    {player.userId === currentUserId && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">You</span>}
                                </div>
                                <div className={`flex items-center gap-1 truncate text-[11px] ${revealResult ? player.resultSkipped ? "text-warning" : player.resultCorrect ? "text-success" : "text-destructive" : "text-muted-foreground"}`}>
                                    {revealResult && (player.resultSkipped ? <SkipForward className="size-3" /> : player.resultCorrect ? <Check className="size-3" /> : <X className="size-3" />)}
                                    <span>{status}</span>
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <div className="font-mono text-xs tabular-nums">{visiblePoints(player).toLocaleString()}</div>
                                <div className="text-[10px] text-muted-foreground">pts</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
