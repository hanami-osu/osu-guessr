import { endGameAction, getGameStateAction, getSuggestionsAction, startGameAction, submitGuessAction } from "@/actions/game-server";
import { GameMode, type GameState, type GameVariant } from "@/actions/types";
import { GameError, handleGameError } from "./errors";
import type { GameClientConfig, GameClientEvents, GameSession } from "./types";

const DEFAULT_CONFIG: GameClientConfig = {
    maxRetries: 3,
    retryDelay: 1000,
};

const ACTION_RELOAD_ATTEMPTED_KEY = "osu-guessr:action-reload-attempted";

export class GameClient {
    private session: GameSession | null = null;
    private mutationPromise: Promise<void> | null = null;
    private endGamePromise: Promise<void> | null = null;
    private disposed = false;
    private readonly handlePageHide = () => this.abandon();
    private readonly handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted) window.location.reload();
    };
    private config: GameClientConfig;

    constructor(
        private events: GameClientEvents,
        private gameMode: GameMode = GameMode.Background,
        private gameVariant: GameVariant = "classic",
        config: Partial<GameClientConfig> = {},
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        if (typeof window !== "undefined") {
            window.addEventListener("pagehide", this.handlePageHide);
            window.addEventListener("pageshow", this.handlePageShow);
        }
    }

    private get storageKey(): string {
        return `osu-guessr:game-session:${this.gameMode}:${this.gameVariant}`;
    }

    private getStorage(): Storage | null {
        return typeof window === "undefined" ? null : window.sessionStorage;
    }

    private persistSessionId(sessionId: string): void {
        try {
            this.getStorage()?.setItem(this.storageKey, sessionId);
        } catch (error) {
            console.warn("Failed to persist game session id:", error);
        }
    }

    private clearStoredSessionId(): void {
        try {
            this.getStorage()?.removeItem(this.storageKey);
        } catch (error) {
            console.warn("Failed to clear stored game session id:", error);
        }
    }

    private reloadForServerActionMismatch(error: Error): boolean {
        if (!error.message.includes("Failed to find Server Action") && !error.message.includes("older or newer deployment")) return false;

        const storage = this.getStorage();
        if (storage && storage.getItem(ACTION_RELOAD_ATTEMPTED_KEY) !== "true") {
            storage.setItem(ACTION_RELOAD_ATTEMPTED_KEY, "true");
            window.location.reload();
        }
        return true;
    }

    private async execute<T>(operation: () => Promise<T>, operationName: string, retryable = true): Promise<T> {
        const maxAttempts = retryable ? this.config.maxRetries : 1;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                const gameError = handleGameError(error);
                lastError = gameError;

                if (this.reloadForServerActionMismatch(gameError)) throw gameError;
                this.events.onError?.(gameError);
                if (!gameError.recoverable || attempt === maxAttempts) throw gameError;

                console.warn(`${operationName} failed (attempt ${attempt}/${maxAttempts}):`, gameError.message);
                await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * 2 ** (attempt - 1)));
            }
        }

        throw lastError ?? new GameError(`Failed to execute ${operationName}`, "OPERATION_FAILED");
    }

    async startGame(): Promise<void> {
        if (this.disposed) return;
        const initialState = await this.execute(() => startGameAction(this.gameMode, this.gameVariant), "startGame", false);
        if (this.disposed) return;
        this.session = { id: initialState.sessionId, state: initialState, timer: null, isActive: true };
        this.persistSessionId(initialState.sessionId);
        this.events.onStateUpdate(initialState);
        this.startTimer();
    }

    async resumeStoredGame(): Promise<boolean> {
        if (this.disposed) return false;
        const sessionId = this.getStorage()?.getItem(this.storageKey);
        if (!sessionId) return false;

        try {
            const state = await this.execute(() => getGameStateAction(sessionId), "resumeStoredGame");
            if (this.disposed) return false;
            if (state.gameStatus !== "active") {
                this.clearStoredSessionId();
                return false;
            }

            this.session = { id: state.sessionId, state, timer: null, isActive: true };
            this.getStorage()?.removeItem(ACTION_RELOAD_ATTEMPTED_KEY);
            this.persistSessionId(state.sessionId);
            this.events.onStateUpdate(state);
            if (!state.currentBeatmap.revealed) this.startTimer();
            return true;
        } catch (error) {
            console.error("Failed to resume stored game:", error);
            const gameError = handleGameError(error);
            if (gameError.recoverable) throw gameError;
            this.clearStoredSessionId();
            return false;
        }
    }

    private startTimer(): void {
        if (!this.session?.isActive) return;
        this.stopTimer();

        this.session.timer = setInterval(() => {
            if (!this.session) return;

            const timeLeft = Math.max(0, this.session.state.timeLeft - 1);
            this.updateState({ ...this.session.state, timeLeft });
            if (timeLeft === 0) void this.handleTimeout();
        }, 1000);
    }

    private stopTimer(): void {
        if (!this.session?.timer) return;
        clearInterval(this.session.timer);
        this.session.timer = null;
    }

    private runMutation(operationName: string, guess: string | null | undefined, restartTimer = false): Promise<void> {
        if (!this.session?.isActive) return Promise.resolve();
        if (this.mutationPromise) return this.mutationPromise;

        const mutationPromise = (async () => {
            this.stopTimer();
            try {
                const state = await this.execute(() => submitGuessAction(this.session!.id, guess), operationName, false);
                this.updateState(state);
                if (restartTimer && state.gameStatus === "active") this.startTimer();
            } catch (error) {
                await this.recoverState();
                if (this.session?.isActive && this.session.state.gameStatus === "active" && !this.session.state.currentBeatmap.revealed) {
                    this.startTimer();
                }
                throw error;
            }
        })();

        this.mutationPromise = mutationPromise.finally(() => {
            this.mutationPromise = null;
        });
        return this.mutationPromise;
    }

    private async handleTimeout(): Promise<void> {
        try {
            await this.runMutation("handleTimeout", "");
        } catch (error) {
            console.error("Failed to handle timeout:", error);
        }
    }

    async submitGuess(guess: string): Promise<void> {
        await this.runMutation("submitGuess", guess);
    }

    async skipAnswer(): Promise<void> {
        await this.runMutation("skipAnswer", null);
    }

    async goNextRound(): Promise<void> {
        await this.runMutation("goNextRound", undefined, true);
    }

    private async recoverState(): Promise<void> {
        if (!this.session?.id) return;

        try {
            this.updateState(await this.execute(() => getGameStateAction(this.session!.id), "recoverState"));
        } catch (error) {
            console.error("Failed to recover state:", error);
        }
    }

    private updateState(state: GameState): void {
        if (!this.session) return;
        this.session.state = state;
        this.events.onStateUpdate(state);

        if (state.gameStatus === "finished") {
            this.stopTimer();
            this.session.isActive = false;
            this.clearStoredSessionId();
        } else {
            this.persistSessionId(state.sessionId);
        }
    }

    endGame(): Promise<void> {
        if (this.endGamePromise) return this.endGamePromise;
        if (!this.session?.isActive) return Promise.resolve();
        this.session.isActive = false;
        this.endGamePromise = this.finishGame().finally(() => {
            this.endGamePromise = null;
        });
        return this.endGamePromise;
    }

    private async finishGame(): Promise<void> {
        await this.mutationPromise?.catch(() => undefined);
        if (!this.session?.id) return;

        const session = this.session;
        this.stopTimer();
        session.isActive = false;

        try {
            await this.execute(() => endGameAction(session.id), "endGame");
        } catch (error) {
            session.isActive = session.state.gameStatus === "active";
            this.persistSessionId(session.id);
            if (session.isActive && !session.state.currentBeatmap.revealed) this.startTimer();
            throw error;
        }

        this.cleanup();
    }

    dispose(): void {
        this.cleanup();
    }

    async getSuggestions(query: string): Promise<string[]> {
        if (!this.session?.isActive || this.session.state.currentBeatmap.revealed) return [];

        try {
            return await getSuggestionsAction(query, this.gameMode);
        } catch (error) {
            console.error("Failed to get suggestions:", error);
            return [];
        }
    }

    private cleanup(): void {
        this.abandon();
        if (typeof window !== "undefined") {
            window.removeEventListener("pagehide", this.handlePageHide);
            window.removeEventListener("pageshow", this.handlePageShow);
        }
    }

    private abandon(): void {
        this.disposed = true;
        this.stopTimer();
        if (this.session) this.session.isActive = false;
        this.session = null;
        this.clearStoredSessionId();
    }
}
