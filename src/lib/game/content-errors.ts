export class NoGameContentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NoGameContentError";
    }
}

export function isNoGameContentError(error: unknown): error is NoGameContentError {
    return error instanceof NoGameContentError;
}
