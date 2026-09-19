import type { GameMode, GameVariant } from "@/actions/types";
import redisClient from "@/lib/redis";
import { acquireRedisLock, releaseRedisLock } from "@/lib/redis-lock-core";
import { getPresentMultiplayerUsers, publishMultiplayerBrowserChanged, publishMultiplayerLobby, publishMultiplayerLobbyDeleted } from "@/lib/multiplayer-realtime";

const LOBBY_TTL_SECONDS = 4 * 60 * 60;
const LOBBY_LOCK_TTL_MS = 5_000;
const USER_LOCK_TTL_MS = 5_000;
const ROUND_LOCK_TTL_MS = 15_000;
const LOBBY_INDEX_KEY = "multiplayer_lobbies";
const CLEAR_USER_LOBBY_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
`;

export type MultiplayerLobbyStatus = "waiting" | "starting" | "playing" | "finished";

export interface MultiplayerPlayer {
    userId: number;
    username: string;
    avatarUrl: string | null;
    joinedAt: string;
    points: number;
    round: number;
    submittedRound: number;
    readyRound: number;
    resultRound: number;
    resultCorrect: boolean | null;
    resultSkipped: boolean;
    resultPoints: number;
    finished: boolean;
    completedMatch: boolean;
    ready: boolean;
}

export interface MultiplayerRoundState {
    submitted: boolean;
    allSubmitted: boolean;
    ready: boolean;
    allReady: boolean;
    submittedCount: number;
    readyCount: number;
    participantCount: number;
}

export interface MultiplayerMessage {
    id: string;
    userId: number;
    username: string;
    message: string;
    sentAt: string;
    kind?: "chat" | "join" | "leave" | "system";
}

export interface MultiplayerLobby {
    code: string;
    name: string;
    maxPlayers: number;
    private: boolean;
    hostId: number;
    gameMode: GameMode;
    variant: GameVariant;
    status: MultiplayerLobbyStatus;
    createdAt: string;
    matchId: string;
    startAt: number | null;
    setupVersion: number;
    notice: string | null;
    players: MultiplayerPlayer[];
    messages: MultiplayerMessage[];
}

export interface MultiplayerLobbySummary {
    code: string;
    name: string;
    hostUsername: string;
    gameMode: GameMode;
    variant: GameVariant;
    status: Exclude<MultiplayerLobbyStatus, "finished">;
    playerCount: number;
    maxPlayers: number;
    createdAt: string;
}

function lobbyKey(code: string): string {
    return `multiplayer_lobby:${code}`;
}

function lobbyLockKey(code: string): string {
    return `multiplayer_lobby_lock:${code}`;
}

function userLobbyKey(userId: number): string {
    return `multiplayer_user_lobby:${userId}`;
}

function userLockKey(userId: number): string {
    return `multiplayer_user_lock:${userId}`;
}

function roundKey(code: string, round: number): string {
    return `multiplayer_round:${code}:${round}`;
}

function roundLockKey(code: string, round: number): string {
    return `multiplayer_round_lock:${code}:${round}`;
}

export function normalizeLobbyCode(code: string): string {
    return code.trim().toUpperCase();
}

export async function readMultiplayerLobby(code: string): Promise<MultiplayerLobby | null> {
    const value = await redisClient.get(lobbyKey(normalizeLobbyCode(code)));
    if (!value) return null;
    const lobby = JSON.parse(value) as MultiplayerLobby;
    return {
        ...lobby,
        name: lobby.name ?? "Multiplayer lobby",
        maxPlayers: lobby.maxPlayers ?? 16,
        private: lobby.private ?? false,
        matchId: lobby.matchId ?? lobby.code,
        startAt: lobby.startAt ?? null,
        setupVersion: lobby.setupVersion ?? 0,
        notice: lobby.notice ?? null,
        players: lobby.players.map((player) => ({
            ...player,
            submittedRound: player.submittedRound ?? 0,
            readyRound: player.readyRound ?? 0,
            resultRound: player.resultRound ?? 0,
            resultCorrect: player.resultCorrect ?? null,
            resultSkipped: player.resultSkipped ?? false,
            resultPoints: player.resultPoints ?? 0,
            completedMatch: player.completedMatch ?? false,
            ready: player.ready ?? false,
        })),
    };
}

export function isMultiplayerLobbyHost(lobby: MultiplayerLobby, userId: number): boolean {
    return lobby.hostId === userId;
}

export function cancelMultiplayerCountdown(lobby: MultiplayerLobby, reason: string): void {
    if (lobby.status !== "starting") return;
    lobby.status = "waiting";
    lobby.startAt = null;
    lobby.notice = reason;
}

export async function finishMultiplayerCountdown(code: string): Promise<void> {
    await withMultiplayerLobbyLock(code, async () => {
        const lobby = await readMultiplayerLobby(code);
        if (!lobby || lobby.status !== "starting" || !lobby.startAt || lobby.startAt > Date.now()) return;
        const present = new Set(await getPresentMultiplayerUsers(code));
        if (lobby.players.length < 2 || lobby.players.some((player) => !present.has(player.userId) || (player.userId !== lobby.hostId && !player.ready))) {
            cancelMultiplayerCountdown(lobby, "A player is no longer ready or connected. Start cancelled.");
            for (const player of lobby.players) if (!present.has(player.userId)) player.ready = false;
        } else {
            lobby.status = "playing";
            lobby.notice = null;
            lobby.players = lobby.players.map((player) => ({ ...player, points: 0, round: 1, submittedRound: 0, readyRound: 0, resultRound: 0, resultCorrect: null, resultSkipped: false, resultPoints: 0, finished: false, completedMatch: false }));
        }
        await writeMultiplayerLobby(lobby);
    });
}

export async function disconnectMultiplayerPlayer(code: string, userId: number): Promise<void> {
    const lobby = await readMultiplayerLobby(code);
    if (!lobby || lobby.status === "playing") return;
    if ((await getPresentMultiplayerUsers(code)).includes(userId)) return;
    await removeMultiplayerUserFromLobby(code, userId);
}

export async function createMultiplayerLobby(lobby: MultiplayerLobby): Promise<boolean> {
    const result = await redisClient.set(lobbyKey(lobby.code), JSON.stringify(lobby), {
        condition: "NX",
        expiration: { type: "EX", value: LOBBY_TTL_SECONDS },
    });
    if (result !== "OK") return false;
    if (!lobby.private) await redisClient.sAdd(LOBBY_INDEX_KEY, lobby.code);
    await publishMultiplayerLobby(lobby);
    await publishMultiplayerBrowserChanged();
    return true;
}

export async function writeMultiplayerLobby(lobby: MultiplayerLobby): Promise<void> {
    await redisClient.set(lobbyKey(lobby.code), JSON.stringify(lobby), { EX: LOBBY_TTL_SECONDS });
    if (lobby.status === "finished" || lobby.private) await redisClient.sRem(LOBBY_INDEX_KEY, lobby.code);
    else await redisClient.sAdd(LOBBY_INDEX_KEY, lobby.code);
    await publishMultiplayerLobby(lobby);
    await publishMultiplayerBrowserChanged();
}

async function deleteMultiplayerLobby(code: string): Promise<void> {
    const normalizedCode = normalizeLobbyCode(code);
    await Promise.all([redisClient.del(lobbyKey(normalizedCode)), redisClient.sRem(LOBBY_INDEX_KEY, normalizedCode)]);
    await publishMultiplayerLobbyDeleted(normalizedCode);
    await publishMultiplayerBrowserChanged();
}

async function getMultiplayerUserLobby(userId: number): Promise<string | null> {
    const code = await redisClient.get(userLobbyKey(userId));
    return code ? normalizeLobbyCode(code) : null;
}

export async function setMultiplayerUserLobby(userId: number, code: string): Promise<void> {
    await redisClient.set(userLobbyKey(userId), normalizeLobbyCode(code));
}

export async function clearMultiplayerUserLobby(userId: number, code: string): Promise<void> {
    await redisClient.eval(CLEAR_USER_LOBBY_SCRIPT, {
        keys: [userLobbyKey(userId)],
        arguments: [normalizeLobbyCode(code)],
    });
}

export async function listMultiplayerLobbies(): Promise<MultiplayerLobbySummary[]> {
    const codes = await redisClient.sMembers(LOBBY_INDEX_KEY);
    if (codes.length === 0) return [];

    const lobbies = await Promise.all(codes.map((code) => readMultiplayerLobby(code)));
    const staleCodes = codes.filter((_, index) => !lobbies[index] || lobbies[index]?.status === "finished" || lobbies[index]?.private);
    if (staleCodes.length > 0) await redisClient.sRem(LOBBY_INDEX_KEY, staleCodes);

    return lobbies
        .filter((lobby): lobby is MultiplayerLobby => Boolean(lobby && lobby.status !== "finished" && !lobby.private))
        .map((lobby) => ({
            code: lobby.code,
            name: lobby.name,
            hostUsername: lobby.players.find((player) => player.userId === lobby.hostId)?.username ?? "Unknown",
            gameMode: lobby.gameMode,
            variant: lobby.variant,
            status: lobby.status as MultiplayerLobbySummary["status"],
            playerCount: lobby.players.length,
            maxPlayers: lobby.maxPlayers,
            createdAt: lobby.createdAt,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function withMultiplayerLobbyLock<T>(code: string, action: () => Promise<T>): Promise<T> {
    const normalizedCode = normalizeLobbyCode(code);
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const lock = await acquireRedisLock(lobbyLockKey(normalizedCode), LOBBY_LOCK_TTL_MS);
        if (lock) {
            try {
                return await action();
            } finally {
                await releaseRedisLock(lock);
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Lobby is busy, please try again");
}

export async function withMultiplayerUserLock<T>(userId: number, action: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const lock = await acquireRedisLock(userLockKey(userId), USER_LOCK_TTL_MS);
        if (lock) {
            try {
                return await action();
            } finally {
                await releaseRedisLock(lock);
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Multiplayer session is busy, please try again");
}

export async function removeMultiplayerUserFromLobby(code: string, userId: number): Promise<void> {
    const normalizedCode = normalizeLobbyCode(code);
    await withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby || !lobby.players.some((player) => player.userId === userId)) {
            await clearMultiplayerUserLobby(userId, normalizedCode);
            return;
        }

        const leavingPlayer = lobby.players.find((player) => player.userId === userId)!;
        cancelMultiplayerCountdown(lobby, `${leavingPlayer.username} left. Start cancelled.`);
        lobby.messages.push({
            id: crypto.randomUUID(),
            userId: leavingPlayer.userId,
            username: leavingPlayer.username,
            message: "left the lobby.",
            sentAt: new Date().toISOString(),
            kind: "leave",
        });
        lobby.messages = lobby.messages.slice(-100);
        lobby.players = lobby.players.filter((player) => player.userId !== userId);
        if (lobby.players.length === 0) {
            await deleteMultiplayerLobby(normalizedCode);
        } else {
            if (lobby.hostId === userId) lobby.hostId = lobby.players[0].userId;
            if (lobby.status === "playing" && lobby.players.every((player) => player.finished)) lobby.status = "finished";
            await writeMultiplayerLobby(lobby);
        }
        await clearMultiplayerUserLobby(userId, normalizedCode);
    });
}

export async function leaveCurrentMultiplayerLobby(userId: number, exceptCode?: string): Promise<void> {
    const currentCode = await getMultiplayerUserLobby(userId);
    const normalizedExceptCode = exceptCode ? normalizeLobbyCode(exceptCode) : null;
    if (currentCode) {
        if (currentCode !== normalizedExceptCode) await removeMultiplayerUserFromLobby(currentCode, userId);
        return;
    }

    const codes = await redisClient.sMembers(LOBBY_INDEX_KEY);
    for (const code of codes) {
        if (normalizeLobbyCode(code) === normalizedExceptCode) continue;
        const lobby = await readMultiplayerLobby(code);
        if (lobby?.players.some((player) => player.userId === userId)) {
            await removeMultiplayerUserFromLobby(code, userId);
        }
    }
}

async function requireMultiplayerLobbyAccess(
    code: string,
    userId: number,
    gameMode?: GameMode,
    variant?: GameVariant,
): Promise<MultiplayerLobby> {
    const lobby = await readMultiplayerLobby(code);
    if (!lobby || !lobby.players.some((player) => player.userId === userId)) {
        throw new Error("Multiplayer lobby not found");
    }
    if (gameMode && lobby.gameMode !== gameMode) throw new Error("Lobby game mode does not match");
    if (variant && lobby.variant !== variant) throw new Error("Lobby variant does not match");
    return lobby;
}

export async function requireActiveMultiplayerLobby(
    code: string,
    userId: number,
    gameMode: GameMode,
    variant: GameVariant,
): Promise<MultiplayerLobby> {
    const lobby = await requireMultiplayerLobbyAccess(code, userId, gameMode, variant);
    if (lobby.status !== "playing") throw new Error("Multiplayer game has not started");
    return lobby;
}

export async function getOrCreateMultiplayerRound<T>(
    code: string,
    round: number,
    create: () => Promise<T>,
): Promise<T> {
    const normalizedCode = normalizeLobbyCode(code);
    const key = roundKey(normalizedCode, round);
    const existing = await redisClient.get(key);
    if (existing) return JSON.parse(existing) as T;

    for (let attempt = 0; attempt < 30; attempt += 1) {
        const lock = await acquireRedisLock(roundLockKey(normalizedCode, round), ROUND_LOCK_TTL_MS);
        if (lock) {
            try {
                const current = await redisClient.get(key);
                if (current) return JSON.parse(current) as T;
                const value = await create();
                await redisClient.set(key, JSON.stringify(value), { EX: LOBBY_TTL_SECONDS });
                return value;
            } finally {
                await releaseRedisLock(lock);
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
        const current = await redisClient.get(key);
        if (current) return JSON.parse(current) as T;
    }

    throw new Error("Multiplayer round is still being prepared");
}

function multiplayerRoundState(lobby: MultiplayerLobby, userId: number, round: number): MultiplayerRoundState {
    const player = lobby.players.find((item) => item.userId === userId);
    if (!player) throw new Error("Multiplayer lobby not found");

    const participants = lobby.players.filter((item) => !item.finished || item.round >= round);
    const submitted = player.submittedRound >= round;
    const submittedCount = participants.filter((item) => item.submittedRound >= round).length;
    const readyCount = participants.filter((item) => item.finished || item.readyRound >= round).length;
    const allSubmitted = participants.length > 0 && submittedCount === participants.length;
    const ready = player.finished || player.readyRound >= round;
    const allReady = allSubmitted && readyCount === participants.length;

    return { submitted, allSubmitted, ready, allReady, submittedCount, readyCount, participantCount: participants.length };
}

export async function getMultiplayerRoundState(code: string, userId: number, round: number): Promise<MultiplayerRoundState> {
    const lobby = await readMultiplayerLobby(code);
    if (!lobby) throw new Error("Multiplayer lobby not found");
    return multiplayerRoundState(lobby, userId, round);
}

export async function markMultiplayerRoundReady(code: string, userId: number, round: number, matchId: string): Promise<MultiplayerRoundState> {
    return withMultiplayerLobbyLock(code, async () => {
        const lobby = await readMultiplayerLobby(code);
        if (!lobby) throw new Error("Multiplayer lobby not found");
        if (lobby.status !== "playing" || lobby.matchId !== matchId) throw new Error("This match has ended");
        const player = lobby.players.find((item) => item.userId === userId);
        if (!player) throw new Error("Multiplayer lobby not found");

        const state = multiplayerRoundState(lobby, userId, round);
        if (!state.submitted || !state.allSubmitted) throw new Error("Waiting for other players to finish");

        player.readyRound = Math.max(player.readyRound, round);
        await writeMultiplayerLobby(lobby);
        return multiplayerRoundState(lobby, userId, round);
    });
}

export async function addMultiplayerMessage(code: string, userId: number, message: string): Promise<void> {
    const parsedMessage = message.trim();
    if (!parsedMessage || parsedMessage.length > 300) throw new Error("Invalid multiplayer message");

    await withMultiplayerLobbyLock(code, async () => {
        const lobby = await requireMultiplayerLobbyAccess(code, userId);
        const player = lobby.players.find((item) => item.userId === userId);
        if (!player) throw new Error("Multiplayer lobby not found");

        lobby.messages.push({
            id: crypto.randomUUID(),
            userId,
            username: player.username,
            message: parsedMessage,
            sentAt: new Date().toISOString(),
        });
        lobby.messages = lobby.messages.slice(-100);
        await writeMultiplayerLobby(lobby);
    });
}

export async function updateMultiplayerProgress(
    code: string,
    userId: number,
    progress: { points: number; round: number; submittedRound?: number; readyRound?: number; resultRound?: number; resultCorrect?: boolean; resultSkipped?: boolean; resultPoints?: number; finished?: boolean; completedMatch?: boolean },
    matchId?: string,
): Promise<void> {
    await withMultiplayerLobbyLock(code, async () => {
        const lobby = await readMultiplayerLobby(code);
        if (!lobby) return;
        if ((lobby.status !== "playing" && !(lobby.status === "finished" && progress.completedMatch === true)) || (matchId && lobby.matchId !== matchId)) return;
        const player = lobby.players.find((item) => item.userId === userId);
        if (!player) return;
        player.points = progress.points;
        player.round = progress.round;
        if (progress.submittedRound !== undefined) player.submittedRound = Math.max(player.submittedRound, progress.submittedRound);
        if (progress.readyRound !== undefined) player.readyRound = Math.max(player.readyRound, progress.readyRound);
        if (progress.resultRound !== undefined && progress.resultCorrect !== undefined) {
            player.resultRound = progress.resultRound;
            player.resultCorrect = progress.resultCorrect;
            player.resultSkipped = progress.resultSkipped ?? false;
            player.resultPoints = progress.resultPoints ?? 0;
        }
        if (progress.finished !== undefined) player.finished = progress.finished;
        if (progress.completedMatch !== undefined) player.completedMatch = progress.completedMatch;
        if (lobby.status === "playing" && lobby.players.length > 0 && lobby.players.every((item) => item.finished)) {
            lobby.status = "finished";
        }
        await writeMultiplayerLobby(lobby);
    });
}
