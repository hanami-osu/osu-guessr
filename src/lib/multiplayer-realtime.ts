import redisClient from "@/lib/redis";
import type { MultiplayerLobby } from "@/lib/multiplayer";

const SOCKET_TOKEN_TTL_SECONDS = 60;
const SOCKET_TOKEN_PREFIX = "multiplayer_socket_token:";
export const MULTIPLAYER_CHANNEL_PREFIX = "multiplayer_events:";
export const MULTIPLAYER_BROWSER_CHANNEL = "multiplayer_browser_events";
export const PRESENCE_TTL_MS = 30_000;

export async function getPresentMultiplayerUsers(code: string): Promise<number[]> {
    const key = `multiplayer_presence:${normalizeCode(code)}`;
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    await redisClient.zRemRangeByScore(key, 0, cutoff);
    const members = await redisClient.zRangeByScore(key, cutoff, "+inf");
    return [...new Set(members.map((member) => Number(member.split(":", 1)[0])).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export type MultiplayerRealtimeEvent = { type: "lobby"; lobby: MultiplayerLobby } | { type: "deleted"; code: string } | { type: "presence"; code: string; userIds: number[] };

function normalizeCode(code: string): string {
    return code.trim().toUpperCase();
}

function multiplayerEventChannel(code: string): string {
    return `${MULTIPLAYER_CHANNEL_PREFIX}${normalizeCode(code)}`;
}

export async function createMultiplayerSocketToken(userId: number): Promise<string> {
    const token = crypto.randomUUID();
    await redisClient.set(`${SOCKET_TOKEN_PREFIX}${token}`, String(userId), { EX: SOCKET_TOKEN_TTL_SECONDS });
    return token;
}

export async function consumeMultiplayerSocketToken(token: string): Promise<number | null> {
    const value = await redisClient.getDel(`${SOCKET_TOKEN_PREFIX}${token}`);
    if (!value) return null;
    const userId = Number(value);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export async function publishMultiplayerRealtimeEvent(code: string, event: MultiplayerRealtimeEvent): Promise<void> {
    await redisClient.publish(multiplayerEventChannel(code), JSON.stringify(event));
}

export async function publishMultiplayerBrowserChanged(): Promise<void> {
    await redisClient.publish(MULTIPLAYER_BROWSER_CHANNEL, "changed");
}

export async function publishMultiplayerLobby(lobby: MultiplayerLobby): Promise<void> {
    await publishMultiplayerRealtimeEvent(lobby.code, { type: "lobby", lobby });
}

export async function publishMultiplayerLobbyDeleted(code: string): Promise<void> {
    const normalizedCode = normalizeCode(code);
    await publishMultiplayerRealtimeEvent(normalizedCode, { type: "deleted", code: normalizedCode });
}
