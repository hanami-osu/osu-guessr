import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import redisClient from "@/lib/redis";
import { GameMode, type GameVariant } from "@/actions/types";
import { endGameForUser, getGameStateForUser, getSuggestions, startGameForUser, submitGuessForUser } from "@/lib/game/server";
import { readOwnedGameSession } from "@/lib/game/session-storage";
import { endScorePpRunForUser, getScorePpRoundForUser, getScorePpRunStateForUser, startScorePpRunForUser, submitScorePpGuessForUser } from "@/lib/score-pp/server";
import { parseMultiplayerMessage, stringifyMultiplayerMessage, type MultiplayerRpcRequest } from "@/lib/multiplayer-protocol";
import {
    addMultiplayerMessage,
    cleanupDisconnectedMultiplayerPlayer,
    finishMultiplayerCountdown,
    markMultiplayerRoundReady,
    normalizeLobbyCode,
    readMultiplayerLobby,
    type MultiplayerLobby,
} from "@/lib/multiplayer";
import {
    consumeMultiplayerSocketToken,
    getPresentMultiplayerUsers,
    MULTIPLAYER_BROWSER_CHANNEL,
    MULTIPLAYER_CHANNEL_PREFIX,
    publishMultiplayerRealtimeEvent,
    PRESENCE_TTL_MS,
    type MultiplayerRealtimeEvent,
} from "@/lib/multiplayer-realtime";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const SOCKET_PATH = "/multiplayer-ws";
const HEARTBEAT_MS = 10_000;
const DISCONNECT_GRACE_MS = 15_000;

type SocketContext = {
    code: string;
    userId: number;
    connectionId: string;
    alive: boolean;
};

type MultiplayerGameSession = {
    user_id: number;
    multiplayer_lobby_id?: string | null;
    multiplayer_match_id?: string | null;
};

type ClientMessage =
    | {
          type: "ready";
          round: number;
          matchId: string;
      }
    | {
          type: "chat";
          message: string;
      }
    | MultiplayerRpcRequest;

const socketsByLobby = new Map<string, Set<WebSocket>>();
const browserSockets = new Set<WebSocket>();
const socketContexts = new WeakMap<WebSocket, SocketContext>();
const countdowns = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCountdown(lobby: MultiplayerLobby): void {
    const previous = countdowns.get(lobby.code);
    if (previous) clearTimeout(previous);
    countdowns.delete(lobby.code);
    if (lobby.status !== "starting" || !lobby.startAt) return;
    const timer = setTimeout(
        () => {
            countdowns.delete(lobby.code);
            void finishMultiplayerCountdown(lobby.code).catch((error) => console.error("Failed to start multiplayer match:", error));
        },
        Math.max(0, lobby.startAt - Date.now()),
    );
    countdowns.set(lobby.code, timer);
    timer.unref();
}

function presenceKey(code: string): string {
    return `multiplayer_presence:${code}`;
}

function presenceMember(userId: number, connectionId: string): string {
    return `${userId}:${connectionId}`;
}

async function touchPresence(context: SocketContext): Promise<void> {
    await redisClient.zAdd(presenceKey(context.code), [
        {
            score: Date.now(),
            value: presenceMember(context.userId, context.connectionId),
        },
    ]);
    await redisClient.expire(presenceKey(context.code), Math.ceil(PRESENCE_TTL_MS / 1000) * 2);
}

async function removePresence(context: SocketContext): Promise<void> {
    await redisClient.zRem(presenceKey(context.code), presenceMember(context.userId, context.connectionId));
}

function broadcast(code: string, event: MultiplayerRealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of socketsByLobby.get(code) ?? []) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
}

async function publishPresence(code: string): Promise<void> {
    const userIds = await getPresentMultiplayerUsers(code);
    await publishMultiplayerRealtimeEvent(code, { type: "presence", code, userIds });
}

function scheduleDisconnectedPlayerCleanup(context: Pick<SocketContext, "code" | "userId">): void {
    const timer = setTimeout(() => {
        void cleanupDisconnectedMultiplayerPlayer(context.code, context.userId).catch((error) => console.error("Failed to clean up disconnected multiplayer player:", error));
    }, DISCONNECT_GRACE_MS);
    timer.unref();
}

function parseClientMessage(data: RawData): ClientMessage | null {
    try {
        const value = parseMultiplayerMessage<Record<string, unknown>>(data.toString());
        if (value.type === "ready") {
            if (!Number.isInteger(value.round) || Number(value.round) < 1 || typeof value.matchId !== "string") return null;
            return { type: "ready", round: Number(value.round), matchId: value.matchId };
        }
        if (value.type === "chat" && typeof value.message === "string") {
            return { type: "chat", message: value.message };
        }
        if (value.type === "rpc" && typeof value.id === "string" && typeof value.action === "string" && value.payload && typeof value.payload === "object") {
            return value as MultiplayerRpcRequest;
        }
        return null;
    } catch {
        return null;
    }
}

async function requireMultiplayerSession(context: SocketContext, value: unknown): Promise<string> {
    if (typeof value !== "string") throw new Error("Invalid game session");
    const session = await readOwnedGameSession<MultiplayerGameSession>(value, context.userId, "Game session not found or expired");
    if (!session.multiplayer_lobby_id || normalizeLobbyCode(session.multiplayer_lobby_id) !== context.code) {
        throw new Error("Game session does not belong to this lobby");
    }
    const lobby = await readMultiplayerLobby(context.code);
    if (!lobby || lobby.matchId !== session.multiplayer_match_id || (lobby.status !== "playing" && lobby.status !== "finished")) {
        throw new Error("Game session belongs to a previous match");
    }
    return value;
}

async function handleRpc(context: SocketContext, message: MultiplayerRpcRequest): Promise<unknown> {
    const payload = message.payload;
    switch (message.action) {
        case "game.start":
            return startGameForUser(context.userId, payload.gameMode as GameMode, payload.variant as GameVariant, context.code);
        case "game.state": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return getGameStateForUser(context.userId, sessionId);
        }
        case "game.submit": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return submitGuessForUser(context.userId, sessionId, payload.guess as string | null | undefined);
        }
        case "game.end": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return endGameForUser(context.userId, sessionId);
        }
        case "game.suggestions":
            return getSuggestions(payload.query as string, payload.gameMode as GameMode);
        case "score_pp.start":
            return startScorePpRunForUser(context.userId, payload.variant as GameVariant, context.code);
        case "score_pp.state": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return getScorePpRunStateForUser(context.userId, sessionId);
        }
        case "score_pp.round": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return getScorePpRoundForUser(context.userId, sessionId, payload.round as number, payload.exclusions as { scoreIds: string[]; userIds: number[]; beatmapIds: number[] });
        }
        case "score_pp.submit": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return submitScorePpGuessForUser(context.userId, sessionId, payload.pairId as number, payload.selectedScoreId as string | null, payload.submissionType as "guess" | "skip" | "timeout");
        }
        case "score_pp.end": {
            const sessionId = await requireMultiplayerSession(context, payload.sessionId);
            return endScorePpRunForUser(context.userId, sessionId);
        }
        default:
            throw new Error("Unknown multiplayer action");
    }
}

async function handleSocketMessage(socket: WebSocket, data: RawData): Promise<void> {
    const context = socketContexts.get(socket);
    if (!context) return;
    const message = parseClientMessage(data);
    if (!message) {
        socket.send(JSON.stringify({ type: "error", message: "Invalid multiplayer message" }));
        return;
    }

    try {
        if (message.type === "ready") {
            await markMultiplayerRoundReady(context.code, context.userId, message.round, message.matchId);
            return;
        }
        if (message.type === "chat") {
            await addMultiplayerMessage(context.code, context.userId, message.message);
            return;
        }
        const result = await handleRpc(context, message);
        socket.send(stringifyMultiplayerMessage({ type: "rpc_result", id: message.id, result }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Multiplayer action failed";
        if (message.type === "rpc") socket.send(stringifyMultiplayerMessage({ type: "rpc_error", id: message.id, message: errorMessage }));
        else socket.send(JSON.stringify({ type: "error", message: errorMessage }));
    }
}

async function registerSocket(socket: WebSocket, requestUrl: URL): Promise<void> {
    if (requestUrl.searchParams.get("mode") === "browser") {
        browserSockets.add(socket);
        socket.on("close", () => browserSockets.delete(socket));
        return;
    }

    const pendingMessages: RawData[] = [];
    let messageHandlerReady = false;
    socket.on("message", (data) => {
        if (!messageHandlerReady) {
            pendingMessages.push(data);
            return;
        }
        void handleSocketMessage(socket, data);
    });

    const token = requestUrl.searchParams.get("token");
    const rawCode = requestUrl.searchParams.get("code");
    if (!token || !rawCode) {
        socket.close(1008, "Missing multiplayer credentials");
        return;
    }

    const code = normalizeLobbyCode(rawCode);
    const userId = await consumeMultiplayerSocketToken(token);
    const lobby = userId ? await readMultiplayerLobby(code) : null;
    if (!userId || !lobby || !lobby.players.some((player) => player.userId === userId)) {
        socket.close(1008, "Multiplayer lobby unavailable");
        return;
    }

    if (socket.readyState !== WebSocket.OPEN) return;

    const context: SocketContext = {
        code,
        userId,
        connectionId: crypto.randomUUID(),
        alive: true,
    };
    socketContexts.set(socket, context);
    const room = socketsByLobby.get(code) ?? new Set<WebSocket>();
    room.add(socket);
    socketsByLobby.set(code, room);

    socket.on("pong", () => {
        const current = socketContexts.get(socket);
        if (current) current.alive = true;
    });
    socket.on("close", () => {
        const current = socketContexts.get(socket);
        if (!current) return;
        const currentRoom = socketsByLobby.get(current.code);
        currentRoom?.delete(socket);
        if (currentRoom?.size === 0) socketsByLobby.delete(current.code);
        void removePresence(current)
            .then(async () => {
                await publishPresence(current.code);
                scheduleDisconnectedPlayerCleanup(current);
            })
            .catch(console.error);
    });

    while (pendingMessages.length > 0) {
        const message = pendingMessages.shift();
        if (message) await handleSocketMessage(socket, message);
    }
    messageHandlerReady = true;

    await touchPresence(context);
    if (socket.readyState !== WebSocket.OPEN) {
        await removePresence(context);
        return;
    }
    const currentLobby = await readMultiplayerLobby(code);
    if (!currentLobby || !currentLobby.players.some((player) => player.userId === userId)) {
        socket.close(1008, "Multiplayer lobby unavailable");
        return;
    }
    scheduleCountdown(currentLobby);
    socket.send(JSON.stringify({ type: "lobby", lobby: currentLobby } satisfies MultiplayerRealtimeEvent));
    socket.send(JSON.stringify({ type: "presence", code, userIds: await getPresentMultiplayerUsers(code) } satisfies MultiplayerRealtimeEvent));
    await publishPresence(code);
}

async function main(): Promise<void> {
    const app = next({ dev, hostname, port });
    await app.prepare();
    const handle = app.getRequestHandler();
    const handleUpgrade = app.getUpgradeHandler();
    const server = createServer((req, res) => handle(req, res));
    const wss = new WebSocketServer({ noServer: true });
    const subscriber = redisClient.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(MULTIPLAYER_BROWSER_CHANNEL, () => {
        const payload = JSON.stringify({ type: "lobbies_changed" });
        for (const socket of browserSockets) {
            if (socket.readyState === WebSocket.OPEN) socket.send(payload);
        }
    });
    await subscriber.pSubscribe(`${MULTIPLAYER_CHANNEL_PREFIX}*`, (message) => {
        try {
            const event = JSON.parse(message) as MultiplayerRealtimeEvent;
            const code = event.type === "lobby" ? event.lobby.code : event.code;
            if (event.type === "lobby") scheduleCountdown(event.lobby);
            broadcast(normalizeLobbyCode(code), event);
        } catch (error) {
            console.error("Invalid multiplayer realtime event:", error);
        }
    });

    server.on("upgrade", (request, socket, head) => {
        const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
        if (requestUrl.pathname !== SOCKET_PATH) {
            void handleUpgrade(request, socket, head);
            return;
        }

        wss.handleUpgrade(request, socket, head, (webSocket) => {
            wss.emit("connection", webSocket, request);
            void registerSocket(webSocket, requestUrl).catch((error) => {
                console.error("Failed to register multiplayer socket:", error);
                webSocket.close(1011, "Multiplayer connection failed");
            });
        });
    });

    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            const context = socketContexts.get(socket);
            if (!context) continue;
            if (!context.alive) {
                socket.terminate();
                continue;
            }
            context.alive = false;
            socket.ping();
            void touchPresence(context).catch(console.error);
        }

        for (const code of socketsByLobby.keys()) {
            void getPresentMultiplayerUsers(code)
                .then(async (userIds) => {
                    broadcast(code, { type: "presence", code, userIds });
                    const lobby = await readMultiplayerLobby(code);
                    if (lobby?.status === "starting") scheduleCountdown(lobby);
                    if (lobby && lobby.status !== "playing") {
                        for (const player of lobby.players) {
                            if (!userIds.includes(player.userId) && (!player.completedMatch || lobby.hostId === player.userId) && Date.now() - Date.parse(player.joinedAt) >= HEARTBEAT_MS) {
                                scheduleDisconnectedPlayerCleanup({ code, userId: player.userId });
                            }
                        }
                    }
                })
                .catch(console.error);
        }
    }, HEARTBEAT_MS);
    heartbeat.unref();

    server.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
