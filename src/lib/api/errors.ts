import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class MissingApiKeyError extends ApiError {
    constructor() {
        super("API key was not provided", 401);
    }
}

export class InvalidApiKeyError extends ApiError {
    constructor() {
        super("Invalid API key", 403);
    }
}

export class ApiRateLimitError extends ApiError {
    constructor() {
        super("Rate limit exceeded", 429);
    }
}

export class ApiValidationServiceError extends ApiError {
    constructor() {
        super("API key validation is temporarily unavailable", 503);
    }
}

export function apiErrorResponse(error: unknown, fallbackMessage: string, logLabel: string) {
    if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: "Invalid request parameters" }, { status: 400 });
    }

    if (error instanceof ApiError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error(`${logLabel}:`, error);
    return NextResponse.json({ success: false, error: fallbackMessage }, { status: 500 });
}
