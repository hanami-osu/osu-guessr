"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Gamepad2, Plus, RefreshCw, Users } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createMultiplayerLobbyAction, listMultiplayerLobbiesAction } from "@/actions/multiplayer-server";
import { GameMode, type GameVariant } from "@/actions/types";
import type { MultiplayerLobbySummary } from "@/lib/multiplayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const GAME_MODE_OPTIONS = [
    { value: GameMode.Background, label: "Background Guessr" },
    { value: GameMode.Audio, label: "Audio Guessr" },
    { value: GameMode.Skin, label: "Skin Guessr" },
    { value: GameMode.ScorePp, label: "Score pp" },
];

function gameModeLabel(mode: GameMode): string {
    return GAME_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export default function MultiplayerBrowser() {
    const { data: session } = useSession();
    const router = useRouter();
    const [lobbies, setLobbies] = useState<MultiplayerLobbySummary[]>([]);
    const [name, setName] = useState("");
    const [maxPlayers, setMaxPlayers] = useState(8);
    const [isPrivate, setIsPrivate] = useState(false);
    const [gameMode, setGameMode] = useState<GameMode>(GameMode.Background);
    const [variant, setVariant] = useState<GameVariant>("classic");
    const [joinCode, setJoinCode] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLobbies(await listMultiplayerLobbiesAction());
        } catch {
            setError("Could not load active lobbies");
        }
    }, []);

    useEffect(() => {
        void refresh();
        let retry: number | undefined;
        let stopped = false;
        let socket: WebSocket | null = null;

        const connect = () => {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            socket = new WebSocket(`${protocol}//${window.location.host}/multiplayer-ws?mode=browser`);
            socket.addEventListener("message", (event) => {
                try {
                    if ((JSON.parse(event.data) as { type?: string }).type === "lobbies_changed") void refresh();
                } catch {
                    return;
                }
            });
            socket.addEventListener("close", () => {
                if (!stopped) retry = window.setTimeout(connect, 1000);
            });
        };

        connect();
        return () => {
            stopped = true;
            if (retry) window.clearTimeout(retry);
            socket?.close();
        };
    }, [refresh]);

    useEffect(() => {
        if (session?.user?.name) setName((current) => current || `${session.user.name}'s lobby`);
    }, [session?.user?.name]);

    const createLobby = async (event: FormEvent) => {
        event.preventDefault();
        if (!session?.user?.banchoId) {
            await signIn("hanami");
            return;
        }

        setIsCreating(true);
        setError(null);
        try {
            const code = await createMultiplayerLobbyAction({ name, maxPlayers, private: isPrivate, gameMode, variant });
            router.push(`/multiplayer/${code}`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not create lobby");
        } finally {
            setIsCreating(false);
        }
    };

    const joinLobby = (event: FormEvent) => {
        event.preventDefault();
        const code = joinCode.trim().toUpperCase();
        if (code) router.push(`/multiplayer/${code}`);
    };

    return (
        <div className="page-container py-8 md:py-10">
            <div className="mb-8 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Users className="size-4" />Multiplayer</div>
                <h1 className="text-3xl font-semibold tracking-tight">Play together</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">Create a room with your own settings or join an active lobby.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <div className="flex flex-col gap-5">
                    <form onSubmit={(event) => void createLobby(event)} className="order-2 rounded-xl border border-border/60 bg-card p-5">
                        <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Plus className="size-4 text-primary" />Create room</div>
                        <div className="space-y-4">
                            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                                Lobby name
                                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="My lobby" required />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                                    Max players
                                    <Input type="number" min={2} max={16} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} required />
                                </label>
                                <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                                    Variant
                                    <Select value={variant} onValueChange={(value) => setVariant(value as GameVariant)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="classic">Classic</SelectItem>
                                            <SelectItem value="survival">Survival</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </label>
                            </div>
                            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                                Game mode
                                <Select value={gameMode} onValueChange={(value) => setGameMode(value as GameMode)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {GAME_MODE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </label>
                            <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2.5">
                                <div>
                                    <div className="text-sm font-medium text-foreground">Private lobby</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">Hidden from active lobbies and joinable only by code.</div>
                                </div>
                                <Switch checked={isPrivate} onCheckedChange={setIsPrivate} aria-label="Private lobby" />
                            </div>
                            <Button className="w-full" type="submit" disabled={isCreating || Boolean(session) && !name.trim()}>
                                {isCreating ? "Creating..." : session ? "Create lobby" : "Sign in to create"}
                            </Button>
                        </div>
                    </form>

                    <form onSubmit={joinLobby} className="order-1 rounded-xl border border-border/60 bg-card p-5">
                        <div className="mb-3 text-sm font-semibold">Join by code</div>
                        <div className="flex gap-2">
                            <Input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} placeholder="ABCD1234" className="font-mono uppercase" />
                            <Button type="submit" variant="outline" disabled={!joinCode.trim()}>Join</Button>
                        </div>
                    </form>
                </div>

                <section className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="flex items-center gap-2 text-sm font-semibold"><Gamepad2 className="size-4 text-primary" />Active lobbies</h2>
                        <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="size-4" />Refresh</Button>
                    </div>

                    {error && <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

                    {lobbies.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 px-6 py-14 text-center text-sm text-muted-foreground">No active lobbies yet.</div>
                    ) : (
                        <div className="space-y-3">
                            {lobbies.map((lobby) => {
                                const full = lobby.playerCount >= lobby.maxPlayers;
                                const joinable = lobby.status === "waiting" && !full;
                                return (
                                    <div key={lobby.code} className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="truncate font-semibold">{lobby.name}</h3>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${lobby.status === "waiting" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                                                    {lobby.status === "waiting" ? "Waiting" : lobby.status === "starting" ? "Starting" : "In progress"}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">{gameModeLabel(lobby.gameMode)} · {lobby.variant} · hosted by {lobby.hostUsername}</div>
                                            <div className="mt-2 font-mono text-xs text-muted-foreground">{lobby.playerCount}/{lobby.maxPlayers} players · {lobby.code}</div>
                                        </div>
                                        <Button variant={joinable ? "default" : "outline"} disabled={!joinable} onClick={() => router.push(`/multiplayer/${lobby.code}`)}>
                                            {lobby.status === "starting" ? "Starting" : lobby.status === "playing" ? "In progress" : full ? "Full" : "Join"}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
