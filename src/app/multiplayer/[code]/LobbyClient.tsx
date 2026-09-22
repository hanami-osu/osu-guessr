"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Crown, DoorOpen, Globe, Lock, MoreHorizontal, Play, RotateCcw, Send, Settings, UserMinus, Users, X } from "lucide-react";
import {
    cancelMultiplayerStartAction,
    joinMultiplayerLobbyAction,
    kickMultiplayerPlayerAction,
    leaveMultiplayerLobbyAction,
    resetMultiplayerLobbyAction,
    setMultiplayerReadyAction,
    startMultiplayerLobbyAction,
    transferMultiplayerHostAction,
    updateMultiplayerLobbyAction,
} from "@/actions/multiplayer-server";
import { GameMode, type GameVariant } from "@/actions/types";
import { GAME_MODES } from "@/app/games/config";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MultiplayerLobby, MultiplayerPlayer } from "@/lib/multiplayer";
import { useMultiplayerSocket } from "@/lib/multiplayer-socket";

type LobbyAction = "start" | "cancel-start" | "ready" | "room-settings" | "reset" | "leave" | "copy" | `kick:${number}` | `host:${number}`;

function variantLabel(variant: GameVariant): string {
    return variant === "survival" ? "Survival" : "Classic";
}

function gameUrl(lobby: MultiplayerLobby): string {
    const mode = GAME_MODES.find((item) => item.id === lobby.gameMode);
    return `${mode?.url ?? "/"}?variant=${lobby.variant}&lobby=${lobby.code}`;
}

function playerIsPresent(player: MultiplayerPlayer, userId: number, presenceUserIds: Set<number> | null, socketConnected: boolean): boolean {
    if (player.userId === userId && socketConnected) return true;
    return presenceUserIds?.has(player.userId) ?? false;
}

function playerStatus(player: MultiplayerPlayer, lobby: MultiplayerLobby, userId: number, isPresent: boolean): string {
    const isCurrent = player.userId === userId;
    if (lobby.status === "playing") return `${player.finished ? "Finished" : "Playing"} · ${player.points.toLocaleString()} pts`;
    if (lobby.status === "finished") return `${player.points.toLocaleString()} pts`;
    if (player.userId === lobby.hostId) {
        if (isCurrent && !isPresent) return "Reconnecting · Host";
        if (!isPresent) return "Disconnected · Host";
        return isCurrent ? "You · Host" : "Host";
    }
    if (isCurrent && !isPresent) return "Reconnecting";
    if (!isPresent) return "Disconnected";
    return `${isCurrent ? "You · " : ""}${player.ready ? "Ready" : "Not ready"}`;
}

function playerStatusClass(player: MultiplayerPlayer, lobby: MultiplayerLobby, userId: number, isPresent: boolean): string {
    if (!isPresent && player.userId === userId) return "text-muted-foreground";
    if (!isPresent) return "text-destructive";
    if (lobby.status === "playing" || lobby.status === "finished") return "text-muted-foreground";
    if (player.userId === lobby.hostId) return "text-primary";
    return player.ready ? "text-success" : "text-muted-foreground";
}

function statusDotClass(player: MultiplayerPlayer, lobby: MultiplayerLobby, userId: number, isPresent: boolean): string {
    if (!isPresent && player.userId === userId) return "bg-muted-foreground";
    if (!isPresent) return "bg-destructive";
    if (lobby.status === "playing" || lobby.status === "finished") return "bg-muted-foreground";
    if (player.userId === lobby.hostId) return "bg-primary";
    return player.ready ? "bg-success" : "bg-muted-foreground";
}

export default function LobbyClient({ code, userId, initialLobby }: { code: string; userId: number; initialLobby?: MultiplayerLobby | null }) {
    const router = useRouter();
    const [localLobby, setLocalLobby] = useState<MultiplayerLobby | null>(initialLobby ?? null);
    const [socketEnabled, setSocketEnabled] = useState(Boolean(initialLobby));
    const [message, setMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [joinAttempt, setJoinAttempt] = useState(0);
    const [exitReason, setExitReason] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [pendingAction, setPendingAction] = useState<LobbyAction | null>(null);
    const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
    const [roomName, setRoomName] = useState("");
    const [roomMaxPlayers, setRoomMaxPlayers] = useState(8);
    const [roomPrivate, setRoomPrivate] = useState(false);
    const [setupGameMode, setSetupGameMode] = useState<GameMode>(GameMode.Background);
    const [setupVariant, setSetupVariant] = useState<GameVariant>("classic");
    const [countdownNow, setCountdownNow] = useState<number | null>(null);
    const chatScrollRef = useRef<HTMLDivElement>(null);
    const chatStickToBottomRef = useRef(true);
    const { lobby: realtimeLobby, connected: socketConnected, presenceUserIds, error: socketError, unavailable, sendChat } = useMultiplayerSocket(code, undefined, socketEnabled);
    const lobby = realtimeLobby ?? localLobby;
    const isHost = lobby?.hostId === userId;
    const currentPlayer = lobby?.players.find((player) => player.userId === userId);
    const isCurrentPlayerFinished = currentPlayer?.finished ?? false;
    const guests = lobby?.players.filter((player) => player.userId !== lobby.hostId) ?? [];
    const readyGuestCount = guests.filter((player) => player.ready).length;
    const everyonePresent = Boolean(lobby && socketConnected && lobby.players.every((player) => playerIsPresent(player, userId, presenceUserIds, socketConnected)));
    const allGuestsReady = guests.length > 0 && guests.every((player) => player.ready);
    const countdown = lobby?.status === "starting" && lobby.startAt !== null && countdownNow !== null ? Math.max(0, Math.ceil((lobby.startAt - countdownNow) / 1000)) : null;
    const shouldEnterGame = useCallback(
        (nextLobby: MultiplayerLobby) => {
            const player = nextLobby.players.find((item) => item.userId === userId);
            return nextLobby.status === "playing" && Boolean(player && !player.finished);
        },
        [userId],
    );

    const enterGame = useCallback(
        (nextLobby: MultiplayerLobby) => {
            router.replace(gameUrl(nextLobby));
        },
        [router],
    );

    useEffect(() => {
        if (initialLobby?.players.some((player) => player.userId === userId)) {
            setLocalLobby(initialLobby);
            setSocketEnabled(true);
            return;
        }

        let active = true;
        setError(null);
        void joinMultiplayerLobbyAction(code)
            .then((joinedLobby) => {
                if (!active) return;
                setLocalLobby(joinedLobby);
                setSocketEnabled(true);
            })
            .catch((cause) => {
                if (active) setError(cause instanceof Error ? cause.message : "Could not join lobby");
            });

        return () => {
            active = false;
        };
    }, [code, initialLobby, joinAttempt, userId]);

    useEffect(() => {
        if (!realtimeLobby) return;
        setError(null);
        if (!realtimeLobby.players.some((player) => player.userId === userId)) {
            setExitReason("You were removed from this lobby.");
            setSocketEnabled(false);
            return;
        }
        if (shouldEnterGame(realtimeLobby)) enterGame(realtimeLobby);
    }, [enterGame, realtimeLobby, shouldEnterGame, userId]);

    useEffect(() => {
        if (!unavailable) return;
        setExitReason("This lobby is no longer available.");
        setSocketEnabled(false);
    }, [unavailable]);

    useLayoutEffect(() => {
        const container = chatScrollRef.current;
        if (container && chatStickToBottomRef.current) container.scrollTop = container.scrollHeight;
    }, [lobby?.messages.length, lobby?.notice]);

    useEffect(() => {
        if (lobby?.status !== "starting" || lobby.startAt === null) {
            setCountdownNow(null);
            return;
        }
        const updateCountdown = () => setCountdownNow(Date.now());
        updateCountdown();
        const timer = window.setInterval(updateCountdown, 250);
        return () => window.clearInterval(timer);
    }, [lobby?.startAt, lobby?.status]);

    const sortedPlayers = useMemo(() => [...(lobby?.players ?? [])].sort((a, b) => Number(b.userId === lobby?.hostId) - Number(a.userId === lobby?.hostId) || a.joinedAt.localeCompare(b.joinedAt)), [lobby]);
    const finalStandings = useMemo(() => [...(lobby?.players ?? [])].sort((a, b) => b.points - a.points || a.joinedAt.localeCompare(b.joinedAt)), [lobby]);

    const saveLobby = async (nextSettings: { name: string; maxPlayers: number; private: boolean; gameMode: GameMode; variant: GameVariant }) => {
        if (!lobby || !isHost || lobby.status !== "waiting") return;
        setPendingAction("room-settings");
        setError(null);
        try {
            setLocalLobby(await updateMultiplayerLobbyAction(code, nextSettings));
            setRoomSettingsOpen(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not update lobby settings");
        } finally {
            setPendingAction(null);
        }
    };

    const handleStart = async () => {
        if (!lobby || !isHost || lobby.status !== "waiting" || pendingAction) return;
        setPendingAction("start");
        setError(null);
        try {
            setLocalLobby(await startMultiplayerLobbyAction(code));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not start lobby");
        } finally {
            setPendingAction(null);
        }
    };

    const handleCancelStart = async () => {
        if (!lobby || !isHost || lobby.status !== "starting" || pendingAction) return;
        setPendingAction("cancel-start");
        setError(null);
        try {
            setLocalLobby(await cancelMultiplayerStartAction(code));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not cancel start");
        } finally {
            setPendingAction(null);
        }
    };

    const toggleReady = async () => {
        if (!lobby || !currentPlayer || isHost || !["waiting", "starting"].includes(lobby.status) || !socketConnected || pendingAction) return;
        setPendingAction("ready");
        setError(null);
        try {
            setLocalLobby(await setMultiplayerReadyAction(code, !currentPlayer.ready, lobby.setupVersion));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not update readiness");
        } finally {
            setPendingAction(null);
        }
    };

    const resetLobby = async () => {
        if (!lobby || !isHost || lobby.status !== "finished" || pendingAction) return;
        setPendingAction("reset");
        setError(null);
        try {
            setLocalLobby(await resetMultiplayerLobbyAction(code));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not return to lobby");
        } finally {
            setPendingAction(null);
        }
    };

    const handleLeave = async () => {
        if (pendingAction) return;
        setPendingAction("leave");
        try {
            await leaveMultiplayerLobbyAction(code);
        } catch {
            setError("Could not leave lobby");
        } finally {
            router.replace("/multiplayer");
        }
    };

    const kickPlayer = async (targetUserId: number) => {
        if (!lobby || !isHost || lobby.status !== "waiting" || pendingAction) return;
        setPendingAction(`kick:${targetUserId}`);
        setError(null);
        try {
            setLocalLobby(await kickMultiplayerPlayerAction(code, targetUserId));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not remove player");
        } finally {
            setPendingAction(null);
        }
    };

    const transferHost = async (targetUserId: number) => {
        if (!lobby || !isHost || !["waiting", "starting", "finished"].includes(lobby.status) || pendingAction) return;
        setPendingAction(`host:${targetUserId}`);
        setError(null);
        try {
            setLocalLobby(await transferMultiplayerHostAction(code, targetUserId));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not transfer host");
        } finally {
            setPendingAction(null);
        }
    };

    const handleMessage = (event: FormEvent) => {
        event.preventDefault();
        const nextMessage = message.trim();
        if (!nextMessage || !sendChat(nextMessage)) return;
        chatStickToBottomRef.current = true;
        setMessage("");
        requestAnimationFrame(() => {
            if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        });
    };

    const copyInvite = async () => {
        if (!lobby || pendingAction) return;
        setPendingAction("copy");
        setError(null);
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setError("Could not copy the invite link");
        } finally {
            setPendingAction(null);
        }
    };

    const handleRoomSettingsOpenChange = (open: boolean) => {
        if (open && lobby) {
            setRoomName(lobby.name);
            setRoomMaxPlayers(lobby.maxPlayers);
            setRoomPrivate(lobby.private);
            setSetupGameMode(lobby.gameMode);
            setSetupVariant(lobby.variant);
        }
        setRoomSettingsOpen(open);
    };

    const roomSettingsPayload = {
        name: roomName.trim(),
        maxPlayers: roomMaxPlayers,
        private: roomPrivate,
        gameMode: setupGameMode,
        variant: setupVariant,
    };

    if (exitReason) {
        return (
            <div className="page-container py-16">
                <div className="mx-auto max-w-2xl space-y-4 border-t border-border/60 pt-5">
                    <p className="text-sm text-muted-foreground">{exitReason}</p>
                    <Button variant="outline" onClick={() => router.replace("/multiplayer")}>
                        Back to lobbies
                    </Button>
                </div>
            </div>
        );
    }

    if (!lobby) {
        return (
            <div className="page-container py-16">
                <div className="mx-auto max-w-2xl space-y-4 border-t border-border/60 pt-5">
                    <p className="text-sm text-muted-foreground">{error ?? socketError ?? (socketEnabled ? "Connecting to lobby..." : "Joining lobby...")}</p>
                    {(error || socketError) && (
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => setJoinAttempt((attempt) => attempt + 1)}>Try again</Button>
                            <Button variant="outline" onClick={() => router.replace("/multiplayer")}>
                                Back to lobbies
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const isWaiting = lobby.status === "waiting";
    const isStarting = lobby.status === "starting";
    const isFinished = lobby.status === "finished";
    const currentPlayerPresent = currentPlayer ? playerIsPresent(currentPlayer, userId, presenceUserIds, socketConnected) : false;
    const actionError = error ?? socketError;
    const startDisabled = Boolean(pendingAction || lobby.players.length < 2 || !allGuestsReady || !everyonePresent);
    const readyPlayerCount = Math.min(lobby.players.length, readyGuestCount + 1);

    return (
        <div className="page-container pb-16 pt-7">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-wrap items-center justify-between gap-5 pb-8">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
                        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{lobby.name}</h1>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                {lobby.private ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />}
                                {lobby.private ? "Private" : "Public"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                                {lobby.players.length}/{lobby.maxPlayers} players
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => void copyInvite()} disabled={pendingAction !== null}>
                            <Copy className="size-4" />
                            <span>{copied ? "Copied" : "Copy invite"}</span>
                        </Button>
                        {isHost && (
                            <div className="ml-2 border-l border-border/60 pl-4">
                                <Dialog open={roomSettingsOpen} onOpenChange={handleRoomSettingsOpenChange}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" aria-label="Room settings" disabled={!isWaiting || pendingAction !== null}>
                                            <Settings className="size-4" />
                                            <span className="hidden sm:inline">Room settings</span>
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Room settings</DialogTitle>
                                            <DialogDescription>Change the room and next match settings.</DialogDescription>
                                        </DialogHeader>
                                        <form
                                            className="space-y-4"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void saveLobby(roomSettingsPayload);
                                            }}
                                        >
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Lobby name
                                                <Input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={40} required />
                                            </label>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Player capacity
                                                <Input
                                                    type="number"
                                                    min={Math.max(2, lobby.players.length)}
                                                    max={16}
                                                    value={roomMaxPlayers}
                                                    onChange={(event) => setRoomMaxPlayers(Number(event.target.value))}
                                                    required
                                                />
                                            </label>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Game mode
                                                <Select value={setupGameMode} onValueChange={(value) => setSetupGameMode(value as GameMode)}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {GAME_MODES.map((mode) => (
                                                            <SelectItem key={mode.id} value={mode.id}>
                                                                {mode.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </label>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Variant
                                                <Select value={setupVariant} onValueChange={(value) => setSetupVariant(value as GameVariant)}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="classic">Classic</SelectItem>
                                                        <SelectItem value="survival">Survival</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </label>
                                            <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
                                                <div>
                                                    <div className="text-sm font-medium">Private lobby</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">Keep this room out of the public browser.</div>
                                                </div>
                                                <Switch checked={roomPrivate} onCheckedChange={setRoomPrivate} aria-label="Private lobby" />
                                            </div>
                                            <DialogFooter>
                                                <Button type="submit" disabled={pendingAction !== null || !roomName.trim()}>
                                                    {pendingAction === "room-settings" ? "Saving..." : "Save settings"}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </div>
                </header>

                <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <section className="contents lg:block lg:min-w-0 lg:pr-10">
                        <div className="order-1 border-b border-border/60 pb-6 lg:order-none">
                            {isFinished ? (
                                <div className="space-y-5">
                                    <div className="flex items-end justify-between gap-4">
                                        <div>
                                            <h2 className="text-2xl font-semibold tracking-tight">Final standings</h2>
                                            <p className="mt-1 text-sm text-muted-foreground">Here&apos;s how everyone scored.</p>
                                        </div>
                                        <span className="shrink-0 text-xs text-muted-foreground">{finalStandings.length} players</span>
                                    </div>
                                    <div className="space-y-3">
                                        {finalStandings.map((player, index) => (
                                            <div
                                                key={player.userId}
                                                className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 rounded-xl px-3 py-4 sm:px-4 ${player.userId === userId ? "bg-primary/10" : "bg-muted/20"}`}
                                            >
                                                <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                                                        <Image src={player.avatarUrl || "/default-avatar.svg"} alt="" fill unoptimized sizes="40px" className="object-cover" />
                                                    </div>
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Link
                                                            href={`/user/${player.userId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="min-w-0 truncate font-semibold hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                                        >
                                                            {player.username}
                                                        </Link>
                                                        {player.userId === userId && <span className="text-[11px] font-medium text-primary">You</span>}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="text-xl font-semibold tabular-nums">
                                                        {player.points.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pts</span>
                                                    </div>
                                                    {player.scoreSessionId && (
                                                        <Link href={`/scores/${player.scoreSessionId}?lobby=${encodeURIComponent(code)}`} className="text-xs text-muted-foreground hover:text-foreground">
                                                            View score
                                                        </Link>
                                                    )}
                                                </div>
                                                {player.results ? (
                                                    <dl className="col-span-3 grid grid-cols-4 gap-2 sm:col-start-2 sm:col-span-2">
                                                        {[
                                                            { label: "Correct", count: player.results.correct, color: "text-green-400" },
                                                            { label: "Wrong", count: player.results.incorrect, color: "text-red-400" },
                                                            { label: "Skipped", count: player.results.skipped, color: "text-amber-400" },
                                                            { label: "Timed out", count: player.results.timedOut, color: "text-muted-foreground" },
                                                        ].map(({ label, count, color }) => (
                                                            <div key={label} className="flex flex-col gap-1">
                                                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                                                <dd className={`text-lg font-semibold tabular-nums ${color}`}>{count}</dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                ) : (
                                                    <p className="col-span-3 text-xs text-muted-foreground sm:col-start-2 sm:col-span-2">Round breakdown unavailable</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-x-6 gap-y-5">
                                    {sortedPlayers.map((player) => {
                                        const present = playerIsPresent(player, userId, presenceUserIds, socketConnected);
                                        const canTransfer = isHost && player.userId !== userId && ["waiting", "starting", "finished"].includes(lobby.status);
                                        const canKick = isHost && isWaiting && player.userId !== userId;
                                        return (
                                            <div key={player.userId} className="flex w-[10.5rem] items-center gap-3">
                                                <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border/70 bg-muted">
                                                    <Image src={player.avatarUrl || "/default-avatar.svg"} alt="" fill unoptimized sizes="48px" className="object-cover" />
                                                    <span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background ${statusDotClass(player, lobby, userId, present)}`} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <Link
                                                            href={`/user/${player.userId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="min-w-0 truncate text-sm font-semibold hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                                        >
                                                            {player.username}
                                                        </Link>
                                                        {player.userId === lobby.hostId && <Crown className="size-3.5 shrink-0 text-primary" aria-label="Host" />}
                                                    </div>
                                                    <div className={`mt-0.5 truncate text-xs font-medium ${playerStatusClass(player, lobby, userId, present)}`}>
                                                        {playerStatus(player, lobby, userId, present)}
                                                    </div>
                                                </div>
                                                {(canTransfer || canKick) && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="-mr-1 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                                                aria-label={`Manage ${player.username}`}
                                                                disabled={pendingAction !== null}
                                                            >
                                                                <MoreHorizontal className="size-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44">
                                                            {canTransfer && (
                                                                <DropdownMenuItem onSelect={() => void transferHost(player.userId)}>
                                                                    <Crown className="size-4" />
                                                                    {pendingAction === `host:${player.userId}` ? "Transferring..." : "Make host"}
                                                                </DropdownMenuItem>
                                                            )}
                                                            {canKick && (
                                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void kickPlayer(player.userId)}>
                                                                    <UserMinus className="size-4" />
                                                                    {pendingAction === `kick:${player.userId}` ? "Removing..." : "Remove player"}
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="order-3 flex h-[27rem] flex-col pt-6 lg:order-none">
                            <div
                                ref={chatScrollRef}
                                className="scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent min-h-0 flex-1 overflow-y-auto pr-2"
                                onScroll={(event) => {
                                    const container = event.currentTarget;
                                    chatStickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 24;
                                }}
                            >
                                {lobby.messages.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>
                                ) : (
                                    lobby.messages.map((item, index) => {
                                        if (item.kind === "join" || item.kind === "leave" || item.kind === "system") {
                                            return (
                                                <div key={item.id} className={`${index === 0 ? "" : "mt-5"} flex items-center gap-3 text-sm text-muted-foreground`}>
                                                    <span className="flex size-9 shrink-0 items-center justify-center">
                                                        <Users className="size-4" />
                                                    </span>
                                                    <span>
                                                        {item.kind === "system" ? (
                                                            item.message
                                                        ) : (
                                                            <>
                                                                <Link
                                                                    href={`/user/${item.userId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                                                >
                                                                    {item.username}
                                                                </Link>{" "}
                                                                {item.message}
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        const previous = lobby.messages[index - 1];
                                        const previousIsChat = previous && previous.kind !== "join" && previous.kind !== "leave" && previous.kind !== "system";
                                        const groupedWithPrevious = Boolean(previousIsChat && previous.userId === item.userId);
                                        if (groupedWithPrevious) {
                                            return (
                                                <div key={item.id} className="mt-1 pl-12 text-sm text-foreground/85">
                                                    <p className="break-words">{item.message}</p>
                                                </div>
                                            );
                                        }

                                        const sender = lobby.players.find((player) => player.userId === item.userId);
                                        return (
                                            <div key={item.id} className={`${index === 0 ? "" : "mt-5"} flex items-start gap-3`}>
                                                <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                                                    <Image src={sender?.avatarUrl || "/default-avatar.svg"} alt="" fill unoptimized sizes="36px" className="object-cover" />
                                                </div>
                                                <div className="min-w-0 pt-0.5">
                                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                        <Link
                                                            href={`/user/${item.userId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-sm font-semibold hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                                                        >
                                                            {item.username}
                                                        </Link>
                                                        <span className="text-[11px] text-muted-foreground">{new Date(item.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                                                    </div>
                                                    <p className="mt-1 break-words text-sm text-foreground/85">{item.message}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                {lobby.notice && (
                                    <div className={`${lobby.messages.length === 0 ? "" : "mt-5"} flex items-center gap-3 text-sm text-muted-foreground`}>
                                        <span className="flex size-9 shrink-0 items-center justify-center">
                                            <Users className="size-4" />
                                        </span>
                                        <span>{lobby.notice}</span>
                                    </div>
                                )}
                            </div>
                            <form className="mt-6 flex items-center gap-2" onSubmit={(event) => void handleMessage(event)}>
                                <Input
                                    value={message}
                                    onChange={(event) => {
                                        setMessage(event.target.value);
                                        chatStickToBottomRef.current = true;
                                        if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                                    }}
                                    maxLength={300}
                                    placeholder="Message lobby..."
                                    aria-label="Message lobby"
                                />
                                <Button type="submit" size="icon" disabled={!message.trim() || !socketConnected} aria-label="Send message">
                                    <Send className="size-4" />
                                </Button>
                            </form>
                        </div>
                    </section>

                    <aside className="order-2 mt-10 self-start border-t border-border/60 pt-8 lg:order-none lg:sticky lg:top-6 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-5">
                        <div className="border-b border-border/60 pb-8">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isFinished ? "Match complete" : "Next match"}</div>
                            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{GAME_MODES.find((mode) => mode.id === lobby.gameMode)?.label ?? lobby.gameMode}</h2>
                            <p className="mt-2 text-lg text-muted-foreground">{variantLabel(lobby.variant)}</p>
                        </div>

                        <div className="border-b border-border/60 py-8">
                            {actionError && <div className="mb-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{actionError}</div>}

                            {isWaiting && (
                                <div className="space-y-5">
                                    <div className="flex items-start gap-3">
                                        <Users className="mt-0.5 size-6 text-primary" />
                                        <div>
                                            <h3 className="font-semibold">
                                                {isHost ? (allGuestsReady && everyonePresent ? "Everyone is ready" : "Waiting for players") : currentPlayer?.ready ? "You are ready" : "Ready when you are"}
                                            </h3>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {isHost
                                                    ? `${readyPlayerCount}/${lobby.players.length} players are ready to start.`
                                                    : currentPlayerPresent
                                                      ? "Let the host know you are ready."
                                                      : "Reconnect to update your readiness."}
                                            </p>
                                        </div>
                                    </div>
                                    {isHost ? (
                                        <>
                                            <Button className="w-full" size="lg" onClick={() => void handleStart()} disabled={startDisabled}>
                                                <Play className="size-4" />
                                                {pendingAction === "start" ? "Starting..." : "Start game"}
                                            </Button>
                                            {!allGuestsReady && guests.length > 0 && <p className="text-xs text-muted-foreground">Everyone must be ready before the host can start.</p>}
                                            {!everyonePresent && <p className="text-xs text-muted-foreground">Everyone must be connected before the match can start.</p>}
                                            {lobby.players.length < 2 && <p className="text-xs text-muted-foreground">Invite at least one more player.</p>}
                                        </>
                                    ) : (
                                        <Button
                                            className="w-full"
                                            size="lg"
                                            variant={currentPlayer?.ready ? "secondary" : "default"}
                                            onClick={() => void toggleReady()}
                                            disabled={!currentPlayerPresent || !socketConnected || pendingAction !== null}
                                        >
                                            <Check className="size-4" />
                                            {pendingAction === "ready" ? "Updating..." : currentPlayer?.ready ? "Not ready" : "Ready up"}
                                        </Button>
                                    )}
                                </div>
                            )}

                            {isStarting && (
                                <div className="space-y-5">
                                    <div className="flex items-start gap-3">
                                        <Play className="mt-0.5 size-6 text-primary" />
                                        <div>
                                            <h3 className="font-semibold">Starting {countdown === null ? "soon" : `in ${countdown}s`}</h3>
                                            <p className="mt-1 text-sm text-muted-foreground">Stay here while the match is prepared.</p>
                                        </div>
                                    </div>
                                    {!isHost && (
                                        <Button
                                            className="w-full"
                                            size="lg"
                                            variant={currentPlayer?.ready ? "secondary" : "outline"}
                                            onClick={() => void toggleReady()}
                                            disabled={!currentPlayerPresent || !socketConnected || pendingAction !== null}
                                        >
                                            {pendingAction === "ready" ? "Updating..." : currentPlayer?.ready ? "Not ready" : "Ready up"}
                                        </Button>
                                    )}
                                    {isHost && (
                                        <Button className="w-full" variant="outline" onClick={() => void handleCancelStart()} disabled={pendingAction !== null}>
                                            <X className="size-4" />
                                            {pendingAction === "cancel-start" ? "Cancelling..." : "Cancel start"}
                                        </Button>
                                    )}
                                </div>
                            )}

                            {lobby.status === "playing" && (
                                <div className="flex items-start gap-3">
                                    <RotateCcw className="mt-0.5 size-6 text-primary" />
                                    <div>
                                        <h3 className="font-semibold">{isCurrentPlayerFinished ? "Your result is in" : "Match in progress"}</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {isCurrentPlayerFinished ? `You scored ${currentPlayer?.points.toLocaleString() ?? 0} points. Waiting for the others.` : "Opening the match..."}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {isFinished && (
                                <div className="space-y-5">
                                    <div>
                                        <h3 className="font-semibold">Results are ready</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">The full standings are shown on the left.</p>
                                    </div>
                                    {isHost ? (
                                        <Button className="w-full" onClick={() => void resetLobby()} disabled={pendingAction !== null}>
                                            <RotateCcw className="size-4" />
                                            {pendingAction === "reset" ? "Preparing..." : "Prepare next match"}
                                        </Button>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Waiting for the host to prepare the next match.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <Button variant="ghost" className="mt-6 w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => void handleLeave()} disabled={pendingAction !== null}>
                            <DoorOpen className="size-4" />
                            {pendingAction === "leave" ? "Leaving..." : "Leave lobby"}
                        </Button>
                    </aside>
                </div>
            </div>
        </div>
    );
}
