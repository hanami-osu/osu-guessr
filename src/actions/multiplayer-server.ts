"use server";

import { z } from "zod";
import { GameMode, type GameVariant } from "@/actions/types";
import { getAuthSession } from "@/actions/server";
import {
    createMultiplayerLobby,
    cancelMultiplayerCountdown,
    clearMultiplayerUserLobby,
    isMultiplayerLobbyHost,
    leaveCurrentMultiplayerLobby,
    listMultiplayerLobbies,
    normalizeLobbyCode,
    readMultiplayerLobby,
    removeMultiplayerUserFromLobby,
    setMultiplayerUserLobby,
    type MultiplayerLobby,
    type MultiplayerLobbySummary,
    withMultiplayerLobbyLock,
    withMultiplayerUserLock,
    writeMultiplayerLobby,
} from "@/lib/multiplayer";
import { createMultiplayerSocketToken, getPresentMultiplayerUsers } from "@/lib/multiplayer-realtime";

const gameModeSchema = z.enum([GameMode.Background, GameMode.Audio, GameMode.Skin, GameMode.ScorePp]);
const variantSchema = z.enum(["classic", "survival"]);
const lobbyCodeSchema = z.string().trim().min(6).max(8).regex(/^[A-Z0-9]+$/);
const lobbySettingsSchema = z.object({
    name: z.string().trim().min(1).max(40),
    maxPlayers: z.number().int().min(2).max(16),
    private: z.boolean(),
    gameMode: gameModeSchema,
    variant: variantSchema,
});
const LOBBY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newLobbyCode(): string {
    return Array.from({ length: 8 }, () => LOBBY_CODE_ALPHABET[Math.floor(Math.random() * LOBBY_CODE_ALPHABET.length)]).join("");
}

function playerFromSession(session: Awaited<ReturnType<typeof getAuthSession>>) {
    return {
        userId: session.user.banchoId,
        username: session.user.name ?? `User ${session.user.banchoId}`,
        avatarUrl: session.user.image ?? null,
        joinedAt: new Date().toISOString(),
        points: 0,
        round: 0,
        submittedRound: 0,
        readyRound: 0,
        resultRound: 0,
        resultCorrect: null,
        resultSkipped: false,
        resultPoints: 0,
        finished: false,
        completedMatch: false,
        ready: false,
    };
}

export async function createMultiplayerLobbyAction(settings: { name: string; maxPlayers: number; private: boolean; gameMode: GameMode; variant: GameVariant }): Promise<string> {
    const parsedSettings = lobbySettingsSchema.parse(settings);
    const session = await getAuthSession();
    const userId = session.user.banchoId;

    return withMultiplayerUserLock(userId, async () => {
        await leaveCurrentMultiplayerLobby(userId);

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const code = newLobbyCode();
            const lobby: MultiplayerLobby = {
                code,
                name: parsedSettings.name,
                maxPlayers: parsedSettings.maxPlayers,
                private: parsedSettings.private,
                hostId: userId,
                gameMode: parsedSettings.gameMode,
                variant: parsedSettings.variant,
                status: "waiting",
                createdAt: new Date().toISOString(),
                matchId: crypto.randomUUID(),
                startAt: null,
                setupVersion: 0,
                notice: null,
                players: [playerFromSession(session)],
                messages: [],
            };
            if (await createMultiplayerLobby(lobby)) {
                await setMultiplayerUserLobby(userId, code);
                return code;
            }
        }

        throw new Error("Could not create a multiplayer lobby");
    });
}

export async function listMultiplayerLobbiesAction(): Promise<MultiplayerLobbySummary[]> {
    return listMultiplayerLobbies();
}

export async function createMultiplayerSocketTokenAction(): Promise<{ token: string; userId: number }> {
    const session = await getAuthSession();
    return {
        token: await createMultiplayerSocketToken(session.user.banchoId),
        userId: session.user.banchoId,
    };
}

export async function joinMultiplayerLobbyAction(code: string): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const session = await getAuthSession();
    const userId = session.user.banchoId;

    return withMultiplayerUserLock(userId, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby) throw new Error("Lobby not found");
        if (lobby.players.some((player) => player.userId === userId)) {
            await leaveCurrentMultiplayerLobby(userId, normalizedCode);
            await setMultiplayerUserLobby(userId, normalizedCode);
            return lobby;
        }
        if (lobby.status !== "waiting") throw new Error("This lobby has already started");
        if (lobby.players.length >= lobby.maxPlayers) throw new Error("This lobby is full");

        await leaveCurrentMultiplayerLobby(userId, normalizedCode);
        return withMultiplayerLobbyLock(normalizedCode, async () => {
            const currentLobby = await readMultiplayerLobby(normalizedCode);
            if (!currentLobby) throw new Error("Lobby not found");
            if (currentLobby.players.some((player) => player.userId === userId)) {
                await setMultiplayerUserLobby(userId, normalizedCode);
                return currentLobby;
            }
            if (currentLobby.status !== "waiting") throw new Error("This lobby has already started");
            if (currentLobby.players.length >= currentLobby.maxPlayers) throw new Error("This lobby is full");
            const joinedPlayer = playerFromSession(session);
            currentLobby.players.push(joinedPlayer);
            currentLobby.messages.push({
                id: crypto.randomUUID(),
                userId: joinedPlayer.userId,
                username: joinedPlayer.username,
                message: "joined the lobby.",
                sentAt: joinedPlayer.joinedAt,
                kind: "join",
            });
            currentLobby.messages = currentLobby.messages.slice(-100);
            await writeMultiplayerLobby(currentLobby);
            await setMultiplayerUserLobby(userId, normalizedCode);
            return currentLobby;
        });
    });
}

export async function updateMultiplayerLobbyAction(
    code: string,
    settings: { name: string; maxPlayers: number; private: boolean; gameMode: GameMode; variant: GameVariant },
): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const parsedSettings = lobbySettingsSchema.parse(settings);
    const session = await getAuthSession();

    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby) throw new Error("Lobby not found");
        if (!isMultiplayerLobbyHost(lobby, session.user.banchoId)) throw new Error("Only a host can change lobby settings");
        if (lobby.status !== "waiting") throw new Error("Lobby settings cannot be changed after the game starts");
        if (parsedSettings.maxPlayers < lobby.players.length) throw new Error("Max players cannot be lower than the current player count");

        if (lobby.gameMode !== parsedSettings.gameMode || lobby.variant !== parsedSettings.variant) {
            lobby.setupVersion += 1;
            for (const player of lobby.players) player.ready = false;
            lobby.notice = null;
            lobby.messages.push({
                id: crypto.randomUUID(),
                userId: session.user.banchoId,
                username: session.user.name ?? "Host",
                message: "Setup changed. Ready up again.",
                sentAt: new Date().toISOString(),
                kind: "system",
            });
            lobby.messages = lobby.messages.slice(-100);
        }
        lobby.name = parsedSettings.name;
        lobby.maxPlayers = parsedSettings.maxPlayers;
        lobby.private = parsedSettings.private;
        lobby.gameMode = parsedSettings.gameMode;
        lobby.variant = parsedSettings.variant;
        await writeMultiplayerLobby(lobby);
        return lobby;
    });
}

export async function kickMultiplayerPlayerAction(code: string, targetUserId: number): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const parsedTargetUserId = z.number().int().positive().parse(targetUserId);
    const session = await getAuthSession();

    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby) throw new Error("Lobby not found");
        if (!isMultiplayerLobbyHost(lobby, session.user.banchoId)) throw new Error("Only a host can kick players");
        if (lobby.status !== "waiting") throw new Error("Players cannot be kicked after the game starts");
        if (isMultiplayerLobbyHost(lobby, parsedTargetUserId)) throw new Error("The host cannot be kicked");

        lobby.players = lobby.players.filter((player) => player.userId !== parsedTargetUserId);
        await writeMultiplayerLobby(lobby);
        await clearMultiplayerUserLobby(parsedTargetUserId, normalizedCode);
        return lobby;
    });
}

export async function transferMultiplayerHostAction(code: string, targetUserId: number): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const parsedTargetUserId = z.number().int().positive().parse(targetUserId);
    const session = await getAuthSession();

    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby) throw new Error("Lobby not found");
        if (!isMultiplayerLobbyHost(lobby, session.user.banchoId)) throw new Error("Only the host can transfer host");
        if (lobby.status !== "waiting" && lobby.status !== "starting" && lobby.status !== "finished") throw new Error("Host cannot be transferred during a game");
        if (!lobby.players.some((player) => player.userId === parsedTargetUserId)) throw new Error("Player not found in lobby");
        if (parsedTargetUserId === lobby.hostId) return lobby;

        if (!(await getPresentMultiplayerUsers(normalizedCode)).includes(parsedTargetUserId)) throw new Error("The new host must be connected");
        cancelMultiplayerCountdown(lobby, "Host changed. Start cancelled.");
        lobby.players.find((player) => player.userId === lobby.hostId)!.ready = false;
        lobby.hostId = parsedTargetUserId;
        await writeMultiplayerLobby(lobby);
        return lobby;
    });
}

export async function leaveMultiplayerLobbyAction(code: string): Promise<void> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const session = await getAuthSession();

    await withMultiplayerUserLock(session.user.banchoId, async () => {
        await removeMultiplayerUserFromLobby(normalizedCode, session.user.banchoId);
    });
}

export async function startMultiplayerLobbyAction(code: string): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const session = await getAuthSession();

    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby) throw new Error("Lobby not found");
        if (!isMultiplayerLobbyHost(lobby, session.user.banchoId)) throw new Error("Only a host can start the lobby");
        if (lobby.status !== "waiting") return lobby;
        if (lobby.players.length < 2) throw new Error("At least two players are required");
        const present = new Set(await getPresentMultiplayerUsers(normalizedCode));
        if (lobby.players.some((player) => !present.has(player.userId))) throw new Error("Waiting for all players to connect");
        if (lobby.players.some((player) => player.userId !== lobby.hostId && !player.ready)) throw new Error("Waiting for all players to ready up");
        lobby.status = "starting";
        lobby.startAt = Date.now() + 3_000;
        lobby.matchId = crypto.randomUUID();
        lobby.notice = null;
        await writeMultiplayerLobby(lobby);
        return lobby;
    });
}

export async function setMultiplayerReadyAction(code: string, ready: boolean, setupVersion: number): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const parsedReady = z.boolean().parse(ready);
    const parsedVersion = z.number().int().nonnegative().parse(setupVersion);
    const session = await getAuthSession();
    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        const player = lobby?.players.find((item) => item.userId === session.user.banchoId);
        if (!lobby || !player) throw new Error("Lobby not found");
        if (lobby.status !== "waiting" && !(lobby.status === "starting" && !parsedReady)) throw new Error("Readiness cannot be changed now");
        if (lobby.setupVersion !== parsedVersion) throw new Error("Setup changed. Review it and ready up again.");
        if (parsedReady && !(await getPresentMultiplayerUsers(normalizedCode)).includes(player.userId)) throw new Error("Reconnect before readying up");
        player.ready = parsedReady;
        if (!parsedReady) cancelMultiplayerCountdown(lobby, `${player.username} is not ready. Start cancelled.`);
        await writeMultiplayerLobby(lobby);
        return lobby;
    });
}

export async function cancelMultiplayerStartAction(code: string): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const session = await getAuthSession();
    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby || lobby.hostId !== session.user.banchoId) throw new Error("Only the host can cancel the start");
        cancelMultiplayerCountdown(lobby, "The host cancelled the start.");
        await writeMultiplayerLobby(lobby);
        return lobby;
    });
}

export async function resetMultiplayerLobbyAction(code: string): Promise<MultiplayerLobby> {
    const normalizedCode = lobbyCodeSchema.parse(normalizeLobbyCode(code));
    const session = await getAuthSession();
    return withMultiplayerLobbyLock(normalizedCode, async () => {
        const lobby = await readMultiplayerLobby(normalizedCode);
        if (!lobby || lobby.hostId !== session.user.banchoId) throw new Error("Only the host can prepare the next match");
        if (lobby.status !== "finished") throw new Error("Wait for the current match to finish");
        lobby.status = "waiting";
        lobby.startAt = null;
        lobby.matchId = crypto.randomUUID();
        lobby.setupVersion += 1;
        lobby.notice = "Ready for another game? Review the setup and ready up.";
        lobby.players = lobby.players.map((player) => ({ ...player, ready: false, points: 0, round: 0, submittedRound: 0, readyRound: 0, resultRound: 0, resultCorrect: null, resultSkipped: false, resultPoints: 0, finished: false, completedMatch: false }));
        await writeMultiplayerLobby(lobby);
        return lobby;
    });
}
