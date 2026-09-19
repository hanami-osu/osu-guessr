"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
    Check,
    Copy,
    Crown,
    DoorOpen,
    Globe,
    Lock,
    MoreHorizontal,
    Play,
    RotateCcw,
    Send,
    Settings,
    UserMinus,
    Users,
    X,
} from "lucide-react";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MultiplayerLobby, MultiplayerPlayer } from "@/lib/multiplayer";
import { useMultiplayerSocket } from "@/lib/multiplayer-socket";

const GAME_MODE_OPTIONS = [
    { value: GameMode.Background, label: "Background Guessr" },
    { value: GameMode.Audio, label: "Audio Guessr" },
    { value: GameMode.Skin, label: "Skin Guessr" },
    { value: GameMode.ScorePp, label: "Score pp" },
];

type LobbyAction =
    | "start"
    | "cancel-start"
    | "ready"
    | "room-settings"
    | "reset"
    | "leave"
    | "copy"
    | `kick:${number}`
    | `host:${number}`;

function gameModeLabel(mode: GameMode): string {
    return GAME_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

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

export default function LobbyClient({
    code,
    userId,
    initialLobby,
    returningFromResults = false,
}: {
    code: string;
    userId: number;
    initialLobby?: MultiplayerLobby | null;
    returningFromResults?: boolean;
}) {
    const router = useRouter();
    const [localLobby, setLocalLobby] = useState<MultiplayerLobby | null>(initialLobby ?? null);
    const [socketEnabled, setSocketEnabled] = useState(Boolean(initialLobby));
    const [message, setMessage] = useState("");
    const [error, setError] = useState<string | null>(null);
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
    const handledResultsReturn = useRef(false);
    const {
        lobby: realtimeLobby,
        connected: socketConnected,
        presenceUserIds,
        error: socketError,
        unavailable,
        sendChat,
    } = useMultiplayerSocket(code, undefined, socketEnabled);
    const lobby = realtimeLobby ?? localLobby;
    const isHost = lobby?.hostId === userId;
    const currentPlayer = lobby?.players.find((player) => player.userId === userId);
    const isCurrentPlayerFinished = currentPlayer?.finished ?? false;
    const guests = useMemo(() => lobby?.players.filter((player) => player.userId !== lobby.hostId) ?? [], [lobby]);
    const readyGuestCount = guests.filter((player) => player.ready).length;
    const everyonePresent = Boolean(
        lobby &&
            socketConnected &&
            lobby.players.every((player) => playerIsPresent(player, userId, presenceUserIds, socketConnected)),
    );
    const allGuestsReady = guests.length > 0 && guests.every((player) => player.ready);
    const countdown = lobby?.status === "starting" && lobby.startAt !== null && countdownNow !== null
        ? Math.max(0, Math.ceil((lobby.startAt - countdownNow) / 1000))
        : null;
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
        if (initialLobby?.players.some((player) => player.userId === userId)) return;

        let active = true;
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
    }, [code, initialLobby, userId]);

    useEffect(() => {
        if (!realtimeLobby) return;
        setError(null);
        if (!realtimeLobby.players.some((player) => player.userId === userId)) {
            router.replace("/multiplayer");
            return;
        }
        if (shouldEnterGame(realtimeLobby)) enterGame(realtimeLobby);
    }, [enterGame, realtimeLobby, router, shouldEnterGame, userId]);

    useEffect(() => {
        if (unavailable) router.replace("/multiplayer");
    }, [router, unavailable]);

    useEffect(() => {
        if (!lobby) return;
        setRoomName(lobby.name);
        setRoomMaxPlayers(lobby.maxPlayers);
        setRoomPrivate(lobby.private);
        setSetupGameMode(lobby.gameMode);
        setSetupVariant(lobby.variant);
    }, [lobby]);

    useEffect(() => {
        if (!returningFromResults || handledResultsReturn.current || !lobby || !isHost || lobby.status !== "finished") return;
        handledResultsReturn.current = true;
        setPendingAction("reset");
        setError(null);
        void resetMultiplayerLobbyAction(code)
            .then((resetLobby) => {
                setLocalLobby(resetLobby);
                router.replace(`/multiplayer/${code}`);
            })
            .catch((cause) => {
                handledResultsReturn.current = false;
                setError(cause instanceof Error ? cause.message : "Could not return to lobby");
            })
            .finally(() => setPendingAction(null));
    }, [code, isHost, lobby, returningFromResults, router]);

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

    const sortedPlayers = useMemo(
        () => [...(lobby?.players ?? [])].sort((a, b) => Number(b.userId === lobby?.hostId) - Number(a.userId === lobby?.hostId) || a.joinedAt.localeCompare(b.joinedAt)),
        [lobby],
    );

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

    const roomSettingsPayload = {
        name: roomName.trim(),
        maxPlayers: roomMaxPlayers,
        private: roomPrivate,
        gameMode: setupGameMode,
        variant: setupVariant,
    };

    if (!lobby) {
        return (
            <div className="page-container py-16">
                <div className="mx-auto max-w-2xl border-t border-border/60 pt-5 text-sm text-muted-foreground">
                    {error ?? socketError ?? (socketEnabled ? "Connecting to lobby..." : "Joining lobby...")}
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
                            <span>{lobby.players.length}/{lobby.maxPlayers} players</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => void copyInvite()} disabled={pendingAction !== null}>
                            <Copy className="size-4" />
                            <span className="font-mono text-xs">{copied ? "Copied" : lobby.code}</span>
                        </Button>
                        {isHost && (
                            <div className="ml-2 border-l border-border/60 pl-4">
                                <Dialog open={roomSettingsOpen} onOpenChange={setRoomSettingsOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" disabled={!isWaiting || pendingAction !== null}>
                                            <Settings className="size-4" />
                                            <span className="hidden sm:inline">Room settings</span>
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Room settings</DialogTitle>
                                            <DialogDescription>Change the room and next match settings.</DialogDescription>
                                        </DialogHeader>
                                        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveLobby(roomSettingsPayload); }}>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Lobby name
                                                <Input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={40} required />
                                            </label>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Player capacity
                                                <Input type="number" min={Math.max(2, lobby.players.length)} max={16} value={roomMaxPlayers} onChange={(event) => setRoomMaxPlayers(Number(event.target.value))} required />
                                            </label>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Game mode
                                                <Select value={setupGameMode} onValueChange={(value) => setSetupGameMode(value as GameMode)}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>{GAME_MODE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </label>
                                            <label className="block space-y-1.5 text-sm font-medium">
                                                Variant
                                                <Select value={setupVariant} onValueChange={(value) => setSetupVariant(value as GameVariant)}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <section className="min-w-0 lg:pr-10">
                    <div className="border-b border-border/60 pb-6">
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
                                                <span className="truncate text-sm font-semibold">{player.username}</span>
                                                {player.userId === lobby.hostId && <Crown className="size-3.5 shrink-0 text-primary" aria-label="Host" />}
                                            </div>
                                            <div className={`mt-0.5 truncate text-xs font-medium ${playerStatusClass(player, lobby, userId, present)}`}>
                                                {playerStatus(player, lobby, userId, present)}
                                            </div>
                                        </div>
                                        {(canTransfer || canKick) && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="-mr-1 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground" aria-label={`Manage ${player.username}`} disabled={pendingAction !== null}>
                                                        <MoreHorizontal className="size-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-44">
                                                    {canTransfer && <DropdownMenuItem onSelect={() => void transferHost(player.userId)}><Crown className="size-4" />{pendingAction === `host:${player.userId}` ? "Transferring..." : "Make host"}</DropdownMenuItem>}
                                                    {canKick && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void kickPlayer(player.userId)}><UserMinus className="size-4" />{pendingAction === `kick:${player.userId}` ? "Removing..." : "Remove player"}</DropdownMenuItem>}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex h-[27rem] flex-col pt-6">
                        <div ref={chatScrollRef} className="scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
                            {lobby.messages.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>
                            ) : (
                                lobby.messages.map((item) => {
                                    if (item.kind === "join" || item.kind === "leave" || item.kind === "system") {
                                        return (
                                            <div key={item.id} className="flex items-center gap-3 text-sm text-muted-foreground">
                                                <span className="flex size-9 shrink-0 items-center justify-center"><Users className="size-4" /></span>
                                                <span>{item.kind === "system" ? item.message : `${item.username} ${item.message}`}</span>
                                            </div>
                                        );
                                    }
                                    const sender = lobby.players.find((player) => player.userId === item.userId);
                                    return (
                                        <div key={item.id} className="flex items-start gap-3">
                                            <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                                                <Image src={sender?.avatarUrl || "/default-avatar.svg"} alt="" fill unoptimized sizes="36px" className="object-cover" />
                                            </div>
                                            <div className="min-w-0 pt-0.5">
                                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                    <span className="text-sm font-semibold">{item.username}</span>
                                                    <span className="text-[11px] text-muted-foreground">{new Date(item.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                                                </div>
                                                <p className="mt-1 break-words text-sm text-foreground/85">{item.message}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            {lobby.notice && (
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <span className="flex size-9 shrink-0 items-center justify-center"><Users className="size-4" /></span>
                                    <span>{lobby.notice}</span>
                                </div>
                            )}
                        </div>
                        <form className="mt-6 flex items-center gap-2" onSubmit={(event) => void handleMessage(event)}>
                            <Input
                                value={message}
                                onChange={(event) => {
                                    setMessage(event.target.value);
                                    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                                }}
                                maxLength={300}
                                placeholder="Message lobby..."
                                aria-label="Message lobby"
                            />
                            <Button type="submit" size="icon" disabled={!message.trim() || !socketConnected} aria-label="Send message"><Send className="size-4" /></Button>
                        </form>
                    </div>
                </section>

                <aside className="mt-10 self-start border-t border-border/60 pt-8 lg:sticky lg:top-6 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-5">
                    <div className="border-b border-border/60 pb-8">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next match</div>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{gameModeLabel(lobby.gameMode)}</h2>
                        <p className="mt-2 text-lg text-muted-foreground">{variantLabel(lobby.variant)}</p>
                    </div>

                    <div className="border-b border-border/60 py-8">
                        {actionError && <div className="mb-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{actionError}</div>}

                        {isWaiting && (
                            <div className="space-y-5">
                                <div className="flex items-start gap-3">
                                    <Users className="mt-0.5 size-6 text-primary" />
                                    <div>
                                        <h3 className="font-semibold">{isHost ? allGuestsReady && everyonePresent ? "Everyone is ready" : "Waiting for players" : currentPlayer?.ready ? "You are ready" : "Ready when you are"}</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {isHost ? `${readyPlayerCount}/${lobby.players.length} players are ready to start.` : currentPlayerPresent ? "Let the host know you are ready." : "Reconnect to update your readiness."}
                                        </p>
                                    </div>
                                </div>
                                {isHost ? (
                                    <>
                                        <Button className="w-full" size="lg" onClick={() => void handleStart()} disabled={startDisabled}><Play className="size-4" />{pendingAction === "start" ? "Starting..." : "Start game"}</Button>
                                        {!allGuestsReady && guests.length > 0 && <p className="text-xs text-muted-foreground">Everyone must be ready before the host can start.</p>}
                                        {!everyonePresent && <p className="text-xs text-muted-foreground">Everyone must be connected before the match can start.</p>}
                                        {lobby.players.length < 2 && <p className="text-xs text-muted-foreground">Invite at least one more player.</p>}
                                    </>
                                ) : (
                                    <Button className="w-full" size="lg" variant={currentPlayer?.ready ? "secondary" : "default"} onClick={() => void toggleReady()} disabled={!currentPlayerPresent || !socketConnected || pendingAction !== null}><Check className="size-4" />{pendingAction === "ready" ? "Updating..." : currentPlayer?.ready ? "Not ready" : "Ready up"}</Button>
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
                                {!isHost && <Button className="w-full" size="lg" variant={currentPlayer?.ready ? "secondary" : "outline"} onClick={() => void toggleReady()} disabled={!currentPlayerPresent || !socketConnected || pendingAction !== null}>{pendingAction === "ready" ? "Updating..." : currentPlayer?.ready ? "Not ready" : "Ready up"}</Button>}
                                {isHost && <Button className="w-full" variant="outline" onClick={() => void handleCancelStart()} disabled={pendingAction !== null}><X className="size-4" />{pendingAction === "cancel-start" ? "Cancelling..." : "Cancel start"}</Button>}
                            </div>
                        )}

                        {lobby.status === "playing" && (
                            <div className="flex items-start gap-3">
                                <RotateCcw className="mt-0.5 size-6 text-primary" />
                                <div>
                                    <h3 className="font-semibold">{isCurrentPlayerFinished ? "Your result is in" : "Match in progress"}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{isCurrentPlayerFinished ? `You scored ${currentPlayer?.points.toLocaleString() ?? 0} points. Waiting for the others.` : "Opening the match..."}</p>
                                </div>
                            </div>
                        )}

                        {isFinished && (
                            <div className="space-y-5">
                                <div>
                                    <h3 className="font-semibold">Match results</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">Everyone has finished this match.</p>
                                </div>
                                <div className="space-y-3">
                                    {[...lobby.players].sort((a, b) => b.points - a.points).map((player, index) => (
                                        <div key={player.userId} className="flex items-center justify-between gap-3 text-sm">
                                            <div className="flex min-w-0 items-center gap-2.5"><span className="w-4 text-xs text-muted-foreground">{index + 1}</span><span className="truncate font-medium">{player.username}</span></div>
                                            <span className="shrink-0 font-mono text-xs text-muted-foreground">{player.points.toLocaleString()} pts</span>
                                        </div>
                                    ))}
                                </div>
                                {isHost ? <Button className="w-full" onClick={() => void resetLobby()} disabled={pendingAction !== null}><RotateCcw className="size-4" />{pendingAction === "reset" ? "Returning..." : "Back to lobby"}</Button> : <p className="text-sm text-muted-foreground">Waiting for the host to start another match.</p>}
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
