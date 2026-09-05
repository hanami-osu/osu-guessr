export class GameError extends Error {
    constructor(message: string, public code: string, public recoverable: boolean = true, public cause?: Error) {
        super(message);
        this.name = "GameError";
    }
}

class NetworkError extends GameError {
    constructor(message: string, cause?: Error) {
        super(message, "NETWORK_ERROR", true, cause);
        this.name = "NetworkError";
    }
}

class SessionError extends GameError {
    constructor(message: string, cause?: Error) {
        super(message, "SESSION_ERROR", false, cause);
        this.name = "SessionError";
    }
}

export function handleGameError(error: unknown): GameError {
    if (error instanceof GameError) {
        return error;
    }

    if (error instanceof Error) {
        if (error.message.includes("fetch") || error.message.includes("network")) {
            return new NetworkError(error.message, error);
        }

        if (error.message.includes("session") || error.message.includes("expired")) {
            return new SessionError(error.message, error);
        }

        return new GameError(error.message, "UNKNOWN_ERROR", true, error);
    }

    return new GameError("An unknown error occurred", "UNKNOWN_ERROR", true);
}
