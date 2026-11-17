import { beforeEach, describe, expect, mock, test } from "bun:test";
import { GameMode, type DatabaseGameSession, type PersistedGameRound } from "@/actions/types";
import type { ScorePpPairSnapshot } from "./types";

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
const updateMultiplayerProgressMock = mock<typeof import("../multiplayer").updateMultiplayerProgress>(async () => {});
const dailyAttemptCreateMock = mock(async (args: { data: Record<string, unknown> }) => args.data);
const dailyAttemptUpsertMock = mock(async (args: { create: Record<string, unknown> }) => args.create);
const dailyAttemptFindUniqueMock = mock(async () => null as { sessionId: string } | null);
const gameChallengeFindUniqueMock = mock(async () => null as { id: string } | null);
const gameChallengeRoundFindUniqueMock = mock(async (_args: { where: { challengeId_roundNumber: { roundNumber: number } } }) => { void _args; return null as { itemType: string; itemId: number; contentSnapshot: unknown } | null; });
const selectStoredScorePpPairMock = mock(async (_round?: number) => { void _round; return pair; });
const gameChallengeCreateMock = mock(async (args: { data: Record<string, unknown> }) => args.data);
const gameChallengeRoundCreateManyMock = mock(async (args: { data: Array<Record<string, unknown>> }) => ({ count: args.data.length }));
const gameChallengeDeleteMock = mock(async () => ({}));
const gameChallengeRoundDeleteManyMock = mock(async () => ({ count: 5 }));
const scorePpBatchFindFirstMock = mock(async () => ({ id: "batch-1" }));
const transactionMock = mock(
    async (
        operation: (transaction: {
            gameChallenge: { create: typeof gameChallengeCreateMock; findUnique: typeof gameChallengeFindUniqueMock; delete: typeof gameChallengeDeleteMock };
            gameChallengeRound: { createMany: typeof gameChallengeRoundCreateManyMock; deleteMany: typeof gameChallengeRoundDeleteManyMock };
        }) => Promise<unknown>,
    ) =>
        operation({
            gameChallenge: { create: gameChallengeCreateMock, findUnique: gameChallengeFindUniqueMock, delete: gameChallengeDeleteMock },
            gameChallengeRound: { createMany: gameChallengeRoundCreateManyMock, deleteMany: gameChallengeRoundDeleteManyMock },
        }),
);
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
const getStoredScorePpPairsByIdsMock = mock(async (_batchId: string, ids: number[]) => ids.map((id) => ({ ...pair, id })));

mock.module("@/lib/redis-lock-core", () => ({ acquireRedisLock: async () => ({ key: "daily", token: "daily" }), releaseRedisLock: async () => {} }));
mock.module("@/lib/env", () => ({ env: { DEBUG_DAILY_REUSE_CHECK: false, DEBUG_DAILY_DAY_OFFSET: 0 } }));
mock.module("@/lib/game/server", () => ({ finishGameSession: finishGameSessionMock, getRoundDifficultySnapshot: getRoundDifficultySnapshotMock }));
mock.module("@/lib/game/session-storage", () => ({
    acquireGameSessionLock: acquireGameSessionLockMock,
    deleteGameSession: mock(async (id: string) => void sessions.delete(id)),
    readOwnedGameSession: readOwnedGameSessionMock,
    releaseGameSessionLock: releaseGameSessionLockMock,
    writeGameSession: writeGameSessionMock,
}));
mock.module("@/lib/database/prisma", () => ({
    prisma: {
        dailyGameAttempt: { create: dailyAttemptCreateMock, upsert: dailyAttemptUpsertMock, findUnique: dailyAttemptFindUniqueMock },
        gameChallenge: { findUnique: gameChallengeFindUniqueMock },
        gameChallengeRound: { findUnique: gameChallengeRoundFindUniqueMock },
        scorePpBatch: { findFirst: scorePpBatchFindFirstMock },
        $transaction: transactionMock,
    },
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
mock.module("@/lib/score-pp/store", () => ({
    getStoredScorePpPairsByIds: getStoredScorePpPairsByIdsMock,
    selectStoredScorePpPair: selectStoredScorePpPairMock,
}));

const { createManualScorePpDailyChallenge, endScorePpRunForUser, getScorePpRoundForUser, getScorePpRunStateForUser, startScorePpRunForUser, submitScorePpGuessForUser } = await import("./server");

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
        dailyAttemptCreateMock.mockReset().mockImplementation(async (args) => args.data);
        dailyAttemptUpsertMock.mockReset().mockImplementation(async (args) => args.create);
        dailyAttemptFindUniqueMock.mockReset().mockResolvedValue(null);
        gameChallengeFindUniqueMock.mockReset().mockResolvedValue(null);
        gameChallengeRoundFindUniqueMock.mockReset().mockResolvedValue(null);
        selectStoredScorePpPairMock.mockReset().mockResolvedValue(pair);
        getStoredScorePpPairsByIdsMock.mockReset().mockImplementation(async (_batchId, ids) => ids.map((id) => ({ ...pair, id })));
        gameChallengeCreateMock.mockReset().mockImplementation(async (args) => args.data);
        gameChallengeRoundCreateManyMock.mockReset().mockImplementation(async (args) => ({ count: args.data.length }));
        scorePpBatchFindFirstMock.mockReset().mockResolvedValue({ id: "batch-1" });
        gameChallengeDeleteMock.mockReset().mockResolvedValue({});
        gameChallengeRoundDeleteManyMock.mockReset().mockResolvedValue({ count: 5 });
        transactionMock.mockReset().mockImplementation(async (operation) =>
            operation({
                gameChallenge: { create: gameChallengeCreateMock, findUnique: gameChallengeFindUniqueMock, delete: gameChallengeDeleteMock },
                gameChallengeRound: { createMany: gameChallengeRoundCreateManyMock, deleteMany: gameChallengeRoundDeleteManyMock },
            }),
        );
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

    test("starts a non-ranked five-round Daily Score PP session and claims its attempt", async () => {
        selectStoredScorePpPairMock.mockImplementation(async (round = 1) => ({ ...pair, id: round }));
        const startedId = await startScorePpRunForUser(1, "classic", undefined, "daily");
        const started = sessions.get(startedId)!;
        expect(started.run_type).toBe("daily");
        expect(started.ranked).toBe(false);
        expect(started.seed).toMatch(/^daily:\d{4}-\d{2}-\d{2}:score_pp$/);
        expect(dailyAttemptCreateMock.mock.calls[0]?.[0].data).toMatchObject({ userId: 1, gameMode: GameMode.ScorePp, sessionId: startedId });
    });

    test("uses the pre-scheduled Score pp pairs for a manually set daily", async () => {
        gameChallengeFindUniqueMock.mockResolvedValueOnce({ id: "scheduled-score-pp" });
        gameChallengeRoundFindUniqueMock.mockResolvedValueOnce({ itemType: "score_pair", itemId: pair.id, contentSnapshot: { pair } });

        const startedId = await startScorePpRunForUser(1, "classic", undefined, "daily");
        const loaded = await getScorePpRoundForUser(1, startedId, 1, { scoreIds: [], userIds: [], beatmapIds: [] });

        expect(sessions.get(startedId)?.challenge_id).toBe("scheduled-score-pp");
        expect(loaded.pair?.id).toBe(pair.id);
        expect(selectStoredScorePpPairMock).not.toHaveBeenCalled();
    });

    test("persists five distinct Score pp pairs for a manual daily challenge", async () => {
        await createManualScorePpDailyChallenge(new Date("2026-11-18T00:00:00.000Z"), [101, 102, 103, 104, 105]);

        const savedRounds = gameChallengeRoundCreateManyMock.mock.calls[0]?.[0].data;
        expect(savedRounds).toHaveLength(5);
        expect(savedRounds?.map((round) => round.itemId)).toEqual([101, 102, 103, 104, 105]);
        expect(savedRounds?.every((round) => round.itemType === "score_pair")).toBe(true);
        expect(gameChallengeCreateMock.mock.calls[0]?.[0].data).toMatchObject({ gameMode: GameMode.ScorePp, dailyDate: new Date("2026-11-18T00:00:00.000Z") });
    });

    test("replaces an existing Score pp daily challenge after overwrite confirmation", async () => {
        gameChallengeFindUniqueMock.mockResolvedValueOnce({ id: "old-score-pp-challenge" });

        await createManualScorePpDailyChallenge(new Date("2026-11-18T00:00:00.000Z"), [101, 102, 103, 104, 105], true);

        expect(gameChallengeRoundDeleteManyMock).toHaveBeenCalledWith({ where: { challengeId: "old-score-pp-challenge" } });
        expect(gameChallengeDeleteMock).toHaveBeenCalledWith({ where: { id: "old-score-pp-challenge" } });
        expect(gameChallengeCreateMock).toHaveBeenCalledTimes(1);
        expect(gameChallengeRoundCreateManyMock).toHaveBeenCalledTimes(1);
    });

    test("times out all unanswered Daily Score PP rounds on exit", async () => {
        const dailyRun: DatabaseGameSession = {
            ...makeRun(),
            multiplayer_lobby_id: null,
            multiplayer_match_id: null,
            variant: "classic",
            run_type: "daily",
            seed: "daily:2026-01-01:score_pp",
            challenge_id: "daily",
            current_round: 2,
            current_item_id: pair.id,
            round_history: [previousRound(1)],
            current_score_pp_pair: pair,
            score_pp_batch_id: pair.batchId,
        };
        sessions.set(sessionId, dailyRun);

        gameChallengeRoundFindUniqueMock.mockImplementation(async ({ where }) => ({ itemType: "score_pair", itemId: pair.id, contentSnapshot: { pair: { ...pair, id: pair.id } }, roundNumber: where.challengeId_roundNumber.roundNumber }));
        expect(await endScorePpRunForUser(1, sessionId)).toBe(37);
        expect(sessions.get(sessionId)).toMatchObject({ is_active: false, current_round: 5, run_type: "daily" });
        expect(sessions.get(sessionId)?.round_history).toHaveLength(5);
        expect(sessions.get(sessionId)?.round_history.at(-1)).toMatchObject({ round_number: 5, result_type: "timeout", correct: false });
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
    test("uses one persisted automatic daily even when another player changes exclusions", async () => {
        let challenge: { id: string } | null = null;
        let rounds: Array<Record<string, unknown>> = [];
        gameChallengeFindUniqueMock.mockImplementation(async () => challenge);
        gameChallengeCreateMock.mockImplementation(async ({ data }) => { challenge = { id: String(data.id) }; return data; });
        gameChallengeRoundCreateManyMock.mockImplementation(async ({ data }) => { rounds = data; return { count: data.length }; });
        gameChallengeRoundFindUniqueMock.mockImplementation(async ({ where }) => rounds.find(round => round.roundNumber === where.challengeId_roundNumber.roundNumber) as { itemType: string; itemId: number; contentSnapshot: unknown } ?? null);
        selectStoredScorePpPairMock.mockImplementation(async (round = 1) => ({ ...pair, id: 200 + round }));
        const firstId = await startScorePpRunForUser(1, "classic", undefined, "daily");
        const first = await getScorePpRoundForUser(1, firstId, 1, { scoreIds: [], userIds: [], beatmapIds: [] });
        expect(rounds).toHaveLength(5);
        const secondId = await startScorePpRunForUser(2, "classic", undefined, "daily");
        const second = await getScorePpRoundForUser(2, secondId, 1, { scoreIds: [pair.left.sourceScoreId], userIds: [], beatmapIds: [] });
        expect(second.pair).toEqual(first.pair);
    });

});
