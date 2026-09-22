"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMultiplayerSocketTokenAction } from "@/actions/multiplayer-server";
import type { MultiplayerLobby, MultiplayerRoundState } from "@/lib/multiplayer";
import { parseMultiplayerMessage, stringifyMultiplayerMessage, type MultiplayerRpcAction, type MultiplayerRpcError, type MultiplayerRpcResult } from "@/lib/multiplayer-protocol";

type LobbyEvent = { type: "lobby"; lobby: MultiplayerLobby };
type DeletedEvent = { type: "deleted"; code: string };
type PresenceEvent = { type: "presence"; code: string; userIds: number[] };
type ErrorEvent = { type: "error"; message: string };
type SocketEvent = LobbyEvent | DeletedEvent | PresenceEvent | ErrorEvent | MultiplayerRpcResult | MultiplayerRpcError;

type PendingRequest = {
    message: string;
    sent: boolean;
    resolve(value: unknown): void;
    reject(reason: Error): void;
};

function getRoundState(lobby: MultiplayerLobby | null, userId: number | null, round: number | undefined): MultiplayerRoundState | null {
    if (!lobby || !userId || round === undefined) return null;
    const player = lobby.players.find((item) => item.userId === userId);
    if (!player) return null;

    const participants = lobby.players.filter((item) => !item.finished || item.round >= round);
    const submitted = player.submittedRound >= round;
    const submittedCount = participants.filter((item) => item.submittedRound >= round).length;
    const readyCount = participants.filter((item) => item.finished || item.readyRound >= round).length;
    const allSubmitted = participants.length > 0 && submittedCount === participants.length;
    const ready = player.finished || player.readyRound >= round;
    const allReady = allSubmitted && readyCount === participants.length;
    return { submitted, allSubmitted, ready, allReady, submittedCount, readyCount, participantCount: participants.length };
}

export function useMultiplayerSocket(code?: string, round?: number, enabled: boolean = true) {
    const [lobby, setLobby] = useState<MultiplayerLobby | null>(null);
    const [userId, setUserId] = useState<number | null>(null);
    const [connected, setConnected] = useState(false);
    const [presenceUserIds, setPresenceUserIds] = useState<Set<number> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const pendingRequestsRef = useRef(new Map<string, PendingRequest>());

    useEffect(() => {
        if (!code || !enabled) {
            setConnected(false);
            setLobby(null);
            setPresenceUserIds(null);
            setUnavailable(false);
            return;
        }

        let active = true;
        let reconnectTimer: number | null = null;

        const connect = async () => {
            try {
                const credentials = await createMultiplayerSocketTokenAction();
                if (!active) return;
                setUserId(credentials.userId);

                const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
                const url = new URL(`${protocol}//${window.location.host}/multiplayer-ws`);
                url.searchParams.set("code", code);
                url.searchParams.set("token", credentials.token);

                const socket = new WebSocket(url);
                socketRef.current = socket;
                socket.onopen = () => {
                    if (!active) return;
                    setConnected(true);
                    setError(null);
                    for (const request of pendingRequestsRef.current.values()) {
                        if (request.sent) continue;
                        request.sent = true;
                        socket.send(request.message);
                    }
                };
                socket.onmessage = (event) => {
                    if (!active) return;
                    try {
                        const message = parseMultiplayerMessage<SocketEvent>(String(event.data));
                        if (message.type === "lobby") {
                            setLobby(message.lobby);
                            setUnavailable(false);
                        } else if (message.type === "deleted") {
                            setLobby(null);
                            setUnavailable(true);
                        } else if (message.type === "presence") setPresenceUserIds(new Set(message.userIds));
                        else if (message.type === "rpc_result") {
                            const pending = pendingRequestsRef.current.get(message.id);
                            if (pending) {
                                pendingRequestsRef.current.delete(message.id);
                                pending.resolve(message.result);
                            }
                        } else if (message.type === "rpc_error") {
                            const pending = pendingRequestsRef.current.get(message.id);
                            if (pending) {
                                pendingRequestsRef.current.delete(message.id);
                                pending.reject(new Error(message.message));
                            }
                        } else if (message.type === "error") setError(message.message);
                    } catch {
                        setError("Invalid multiplayer update");
                    }
                };
                socket.onclose = () => {
                    if (!active) return;
                    setConnected(false);
                    if (socketRef.current === socket) socketRef.current = null;
                    for (const [id, request] of pendingRequestsRef.current) {
                        if (!request.sent) continue;
                        pendingRequestsRef.current.delete(id);
                        request.reject(new Error("Connection closed"));
                    }
                    reconnectTimer = window.setTimeout(() => void connect(), 1000);
                };
                socket.onerror = () => {
                    if (active) setConnected(false);
                };
            } catch (cause) {
                if (!active) return;
                setConnected(false);
                setError(cause instanceof Error ? cause.message : "Could not connect to multiplayer");
                reconnectTimer = window.setTimeout(() => void connect(), 1500);
            }
        };

        void connect();
        return () => {
            active = false;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [code, enabled]);

    const request = useCallback(
        function request<T>(action: MultiplayerRpcAction, payload: Record<string, unknown>): Promise<T> {
            if (!code || !enabled) return Promise.reject(new Error("Multiplayer connection is unavailable"));

            const id = crypto.randomUUID();
            const message = stringifyMultiplayerMessage({ type: "rpc", id, action, payload });
            return new Promise<T>((resolve, reject) => {
                const pending: PendingRequest = {
                    message,
                    sent: false,
                    resolve: (value) => resolve(value as T),
                    reject,
                };
                pendingRequestsRef.current.set(id, pending);

                const socket = socketRef.current;
                if (socket?.readyState === WebSocket.OPEN) {
                    pending.sent = true;
                    socket.send(message);
                }
            });
        },
        [code, enabled],
    );

    const sendReady = useCallback(
        (readyRound: number): boolean => {
            const socket = socketRef.current;
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                setError("Multiplayer connection is reconnecting");
                return false;
            }
            if (!lobby) return false;
            socket.send(JSON.stringify({ type: "ready", round: readyRound, matchId: lobby.matchId }));
            return true;
        },
        [lobby],
    );

    const sendChat = useCallback((message: string): boolean => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            setError("Multiplayer connection is reconnecting");
            return false;
        }
        socket.send(JSON.stringify({ type: "chat", message }));
        return true;
    }, []);

    const getSocketRoundState = useCallback((targetRound: number) => getRoundState(lobby, userId, targetRound), [lobby, userId]);
    const roundState = useMemo(() => (round === undefined ? null : getSocketRoundState(round)), [getSocketRoundState, round]);

    return {
        lobby,
        userId,
        connected,
        presenceUserIds,
        roundState,
        getRoundState: getSocketRoundState,
        error,
        unavailable,
        request,
        sendReady,
        sendChat,
    };
}
