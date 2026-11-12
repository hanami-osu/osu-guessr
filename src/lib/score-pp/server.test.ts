import { beforeEach, describe, expect, mock, test } from "bun:test";
import { GameMode, type DatabaseGameSession, type PersistedGameRound } from "@/actions/types";
import type { ScorePpPairSnapshot } from "@/lib/score-pp/types";

const sessionId = "00000000-0000-4000-8000-000000000001";
const peerSessionId = "00000000-0000-4000-8000-000000000002";
const sessions = new Map<string, DatabaseGameSession>();
const sessionLocks = new Set<string>();
const finishingLocks: { id: string; held: string[] }[] = [];
let lobbyPlayers: { userId: number; scoreSessionId: string; finished?: boolean }[] = [];
let allSubmitted = false;

const finishGameSessionMock = mock(async (id: string) => {
    finishingLocks.push({ id, held: [...sessionLocks] });
    const run = sessions.get(id);
    if (run) sessions.set(id, { ...run, is_active: false, end_pending: false, pp: 37 });
    return 37;
});
const getRoundDifficultySnapshotMock = mock(async () => 1.37);
const readOwnedGameSessionMock = mock(async <T extends { user_id: number }>(id: string, userId: number, message: string, matches?: (run: T) => boolean) => {
    const run = sessions.get(id);
    if (!run || run.user_id !== userId || (matches && !matches(run as unknown as T))) throw new Error(message);
    return run as unknown as T;
});
const writeGameSessionMock = mock(async <T extends { id: string }>(run: T) => {
    sessions.set(run.id, run as unknown as DatabaseGameSession);
});
const acquireGameSessionLockMock = mock(async (id: string) => {
    if (sessionLocks.has(id)) return null;
    sessionLocks.add(id);
    return { key: id, token: id };
});
const releaseGameSessionLockMock = mock(async (lock: { key: string }) => {
    sessionLocks.delete(lock.key);
});
const getMultiplayerRoundStateMock = mock(async () => ({ allSubmitted, submitted: true, ready: false, allReady: false, submittedCount: 1, readyCount: 0, participantCount: 2 }));
const updateMultiplayerProgressMock = mock<typeof import("@/lib/multiplayer").updateMultiplayerProgress>(async () => {});
const readMultiplayerLobbyMock = mock(async () => ({ code: "ABC123", matchId: "match-1", startAt: null, players: lobbyPlayers }));
const getOrCreateMultiplayerRoundMock = mock(async <T>(_code: string, _round: number, create: () => Promise<T>) => create());
const pair: ScorePpPairSnapshot = {
    id: 102,
    batchId: "batch-1",
    left: {
        sourceScoreId: "score-left",
        player: { userId: 1, username: "Left", avatarUrl: "", globalRank: null },
        beatmap: { beatmapId: 1, beatmapsetId: 11, artist: "Artist", title: "Track", difficultyName: "Hard", starRating: 5, maxCombo: 100, backgroundUrl: "", beatmapUrl: "" },
        mods: [],
        score: "1000000",
        accuracy: 1,
        maxCombo: 100,
        statistics: { great: 100, ok: 0, meh: 0, miss: 0 },
        pp: 120,
        endedAt: "2026-01-01T00:00:00.000Z",
    },
    right: {
        sourceScoreId: "score-right",
        player: { userId: 2, username: "Right", avatarUrl: "", globalRank: null },
        beatmap: { beatmapId: 2, beatmapsetId: 22, artist: "Artist", title: "Track", difficultyName: "Hard", starRating: 5, maxCombo: 100, backgroundUrl: "", beatmapUrl: "" },
        mods: [],
        score: "900000",
        accuracy: 0.99,
        maxCombo: 90,
        statistics: { great: 90, ok: 10, meh: 0, miss: 0 },
        pp: 100,
        endedAt: "2026-01-01T00:00:00.000Z",
    },
    ppGap: 20,
};

mock.module("@/lib/game/server", () => ({ finishGameSession: finishGameSessionMock, getRoundDifficultySnapshot: getRoundDifficultySnapshotMock }));
mock.module("@/lib/game/session-storage", () => ({
    acquireGameSessionLock: acquireGameSessionLockMock,
    readOwnedGameSession: readOwnedGameSessionMock,
    releaseGameSessionLock: releaseGameSessionLockMock,
    writeGameSession: writeGameSessionMock,
}));
mock.module("@/lib/multiplayer", () => ({
    getMultiplayerRoundState: getMultiplayerRoundStateMock,
    getOrCreateMultiplayerRound: getOrCreateMultiplayerRoundMock,
    normalizeLobbyCode: (code: string) => code.trim().toUpperCase(),
    readMultiplayerLobby: readMultiplayerLobbyMock,
    requireActiveMultiplayerLobby: mock(async () => ({ matchId: "match-1", startAt: null, players: lobbyPlayers })),
    updateMultiplayerProgress: updateMultiplayerProgressMock,
}));
mock.module("@/lib/score-pp/beatmap-max-combo", () => ({ getBeatmapMaxCombo: mock(async () => 100) }));
mock.module("@/lib/score-pp/store", () => ({ selectStoredScorePpPair: mock(async () => pair) }));

const { endScorePpRunForUser, getScorePpRoundForUser, getScorePpRunStateForUser, startScorePpRunForUser, submitScorePpGuessForUser } = await import("./server");

function previousRound(round: number): PersistedGameRound {
    return {
        round_number: round,
        item_type: "score_pair",
        item_id: 100 + round,
        submitted_guess: "Wrong choice",
        answer_snapshot: "Higher score",
        result_type: "guess",
        correct: false,
        response_time_ms: 1000,
        time_limit_ms: 30_000,
        points_earned: -20,
        streak_before: 0,
        streak_after: 0,
        difficulty_snapshot: 1,
        content_snapshot: null,
    };
}

function makeRun(): DatabaseGameSession {
    return {
        id: sessionId,
        user_id: 1,
        game_mode: GameMode.ScorePp,
        total_points: -40,
        current_streak: 0,
        highest_streak: 0,
        current_round: 3,
        current_item_id: 0,
        time_left: 30,
        last_action_at: new Date().toISOString(),
        last_guess: null,
        last_guess_correct: null,
        last_points: null,
        correct_guesses: 0,
        total_time_used: 2,
        total_response_time_ms: 2000,
        is_active: true,
        variant: "survival",
        run_type: "standard",
        challenge_id: null,
        seed: null,
        config_snapshot: null,
        ranked: true,
        ruleset_version: 1,
        pp_version: 1,
        started_at: new Date().toISOString(),
        round_history: [previousRound(1), previousRound(2)],
        title: "",
        artist: "",
        mapper: "",
        image_filename: "",
        audio_filename: "",
        has_guessed_current_round: false,
        multiplayer_lobby_id: "abc123",
        multiplayer_match_id: "match-1",
        score_pp_batch_id: null,
        current_score_pp_pair: null,
    };
}

function prepareTwoPlayerRound(): void {
    for (const [id, userId] of [
        [sessionId, 1],
        [peerSessionId, 2],
    ] as const) {
        sessions.set(id, { ...makeRun(), id, user_id: userId, current_item_id: pair.id, current_score_pp_pair: pair, current_difficulty_snapshot: 1 });
    }
    lobbyPlayers = [
        { userId: 1, scoreSessionId: sessionId },
        { userId: 2, scoreSessionId: peerSessionId },
    ];
    const submittedUsers = new Set<number>();
    updateMultiplayerProgressMock.mockImplementation(async (_code, userId, progress) => {
        if (progress.submittedRound === 3) submittedUsers.add(userId);
        allSubmitted = submittedUsers.size === 2;
    });
}

describe("Score PP multiplayer reveal boundary", () => {
    beforeEach(() => {
        sessions.clear();
        sessions.set(sessionId, makeRun());
        sessionLocks.clear();
        finishingLocks.length = 0;
        lobbyPlayers = [];
        allSubmitted = false;
        finishGameSessionMock.mockClear();
        getRoundDifficultySnapshotMock.mockClear().mockResolvedValue(1.37);
        readOwnedGameSessionMock.mockClear();
        writeGameSessionMock.mockClear();
        getMultiplayerRoundStateMock.mockClear().mockImplementation(async () => ({ allSubmitted, submitted: true, ready: false, allReady: false, submittedCount: 1, readyCount: 0, participantCount: 2 }));
        updateMultiplayerProgressMock.mockReset().mockImplementation(async () => {});
        getOrCreateMultiplayerRoundMock.mockClear().mockImplementation(async (_code, _round, create) => create());
    });

    test("refuses to restart a finished multiplayer run but resumes one still awaiting its reveal", async () => {
        lobbyPlayers = [{ userId: 1, scoreSessionId: sessionId, finished: true }];
        sessions.set(sessionId, { ...makeRun(), multiplayer_lobby_id: "ABC123", multiplayer_match_id: "match-1", has_guessed_current_round: true });
        expect(await startScorePpRunForUser(1, "survival", "ABC123")).toBe(sessionId);

        sessions.set(sessionId, { ...makeRun(), multiplayer_lobby_id: "ABC123", multiplayer_match_id: "match-1", is_active: false });
        expect(startScorePpRunForUser(1, "survival", "ABC123")).rejects.toThrow("already finished");
        expect(sessions.size).toBe(1);
        expect(updateMultiplayerProgressMock).not.toHaveBeenCalled();
    });

    test("withholds a terminal answer until everyone submits, then recovers it with the frozen pair difficulty", async () => {
        const loaded = await getScorePpRoundForUser(1, sessionId, 3, { scoreIds: [], userIds: [], beatmapIds: [] });
        expect(loaded.pair).not.toBeNull();
        expect(getRoundDifficultySnapshotMock).toHaveBeenCalledTimes(1);

        const servedRun = sessions.get(sessionId)!;
        expect(servedRun.current_difficulty_snapshot).toBe(1.37);
        expect(servedRun.current_score_pp_pair?.difficultySnapshot).toBe(1.37);

        const submitResult = await submitScorePpGuessForUser(1, sessionId, pair.id, "score-right", "guess");
        expect(submitResult).toBeNull();
        expect(sessions.get(sessionId)?.round_history.at(-1)?.difficulty_snapshot).toBe(1.37);
        expect(finishGameSessionMock).not.toHaveBeenCalled();

        const waiting = await getScorePpRunStateForUser(1, sessionId);
        expect(waiting).toMatchObject({
            active: true,
            terminal: false,
            saved: false,
            submitted: true,
            points: -40,
            streak: 0,
            maxStreak: 0,
            mistakes: 2,
            resolution: null,
        });
        expect(waiting.runPp).toBeUndefined();
        expect(finishGameSessionMock).not.toHaveBeenCalled();
        expect(await endScorePpRunForUser(1, sessionId)).toEqual({ pending: true });
        expect(finishGameSessionMock).not.toHaveBeenCalled();

        allSubmitted = true;
        const revealed = await getScorePpRunStateForUser(1, sessionId);
        expect(finishGameSessionMock).toHaveBeenCalledTimes(1);
        expect(revealed).toMatchObject({ active: false, terminal: true, saved: true, runPp: 37 });
        expect(revealed.resolution).toMatchObject({
            correct: false,
            resultType: "guess",
            selectedScoreId: "score-right",
            higherScoreId: "score-left",
            scorePp: { "score-left": 120, "score-right": 100 },
            mistakes: 3,
            terminal: true,
            runPp: 37,
        });
    });

    test("uses a neutral difficulty when resuming a legacy served pair without a snapshot", async () => {
        const run = makeRun();
        run.current_item_id = pair.id;
        run.current_score_pp_pair = pair;
        sessions.set(sessionId, run);

        await getScorePpRoundForUser(1, sessionId, 3, { scoreIds: [], userIds: [], beatmapIds: [] });

        expect(getRoundDifficultySnapshotMock).not.toHaveBeenCalled();
        expect(sessions.get(sessionId)?.current_difficulty_snapshot).toBe(1);
        expect(sessions.get(sessionId)?.current_score_pp_pair?.difficultySnapshot).toBe(1);
    });

    test("the last submission saves a terminal peer without further polling or holding the submitter lock", async () => {
        prepareTwoPlayerRound();

        expect(await submitScorePpGuessForUser(1, sessionId, pair.id, "score-right", "guess")).toBeNull();
        expect(finishGameSessionMock).not.toHaveBeenCalled();

        const result = await submitScorePpGuessForUser(2, peerSessionId, pair.id, "score-left", "guess");

        expect(result).toMatchObject({ correct: true, terminal: false });
        expect(sessions.get(sessionId)?.pp).toBe(37);
        expect(sessions.get(sessionId)?.is_active).toBe(false);
        expect(sessions.get(peerSessionId)?.is_active).toBe(true);
        expect(finishingLocks).toEqual([{ id: sessionId, held: [sessionId] }]);
        expect(sessionLocks.size).toBe(0);
    });

    test("an in-flight state request finalizes its terminal run after the last submitter skips its lock", async () => {
        prepareTwoPlayerRound();
        expect(await submitScorePpGuessForUser(1, sessionId, pair.id, "score-right", "guess")).toBeNull();

        let notifyStateRead!: () => void;
        const stateRead = new Promise<void>((resolve) => {
            notifyStateRead = resolve;
        });
        let releaseState!: () => void;
        const pausedState = new Promise<void>((resolve) => {
            releaseState = resolve;
        });
        let pauseNextState = true;
        getMultiplayerRoundStateMock.mockImplementation(async () => {
            const state = { allSubmitted, submitted: true, ready: false, allReady: false, submittedCount: 1, readyCount: 0, participantCount: 2 };
            if (pauseNextState) {
                pauseNextState = false;
                notifyStateRead();
                await pausedState;
            }
            return state;
        });

        const inFlightState = getScorePpRunStateForUser(1, sessionId);
        await stateRead;
        try {
            await submitScorePpGuessForUser(2, peerSessionId, pair.id, "score-left", "guess");
            expect(sessions.get(sessionId)?.pp).toBeUndefined();
        } finally {
            releaseState();
            await inFlightState;
        }

        expect((await inFlightState).resolution).toBeNull();
        expect(sessions.get(sessionId)?.pp).toBe(37);
        expect(finishingLocks).toEqual([{ id: sessionId, held: [sessionId] }]);
        expect(sessionLocks.size).toBe(0);
    });
});
