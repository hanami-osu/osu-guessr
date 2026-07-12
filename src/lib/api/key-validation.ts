import crypto from "crypto";
import { ApiError, ApiRateLimitError, ApiValidationServiceError, InvalidApiKeyError, MissingApiKeyError } from "./errors";

const API_RATE_LIMIT_WINDOW_SECONDS = 60;
const API_RATE_LIMIT_MAX_REQUESTS = 120;
const API_LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

type QueryFunction = (sql: string, values?: Array<unknown>) => Promise<unknown[]>;

interface RateLimitClient {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<unknown>;
}

interface ApiKeyValidationDependencies {
    query: QueryFunction;
    redis: RateLimitClient;
    now?: () => number;
}

function hashApiKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export async function validateApiKeyValue(apiKey: string | null | undefined, dependencies: ApiKeyValidationDependencies): Promise<number> {
    if (!apiKey) {
        throw new MissingApiKeyError();
    }

    const hashedKey = hashApiKey(apiKey);

    try {
        const [key] = (await dependencies.query(`SELECT user_id, last_used FROM api_keys WHERE id = ?`, [hashedKey])) as [{ user_id: number; last_used: Date | string | null }?];

        if (!key) {
            throw new InvalidApiKeyError();
        }

        const rateLimitKey = `api_key_rate:${hashedKey}`;
        const requestCount = await dependencies.redis.incr(rateLimitKey);
        if (requestCount === 1) {
            await dependencies.redis.expire(rateLimitKey, API_RATE_LIMIT_WINDOW_SECONDS);
        }

        if (requestCount > API_RATE_LIMIT_MAX_REQUESTS) {
            throw new ApiRateLimitError();
        }

        const now = dependencies.now?.() ?? Date.now();
        const lastUsed = key.last_used ? new Date(key.last_used).getTime() : 0;
        if (!lastUsed || now - lastUsed >= API_LAST_USED_UPDATE_INTERVAL_MS) {
            await dependencies.query(`UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?`, [hashedKey]);
        }

        return key.user_id;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        console.error("API key validation failed:", error);
        throw new ApiValidationServiceError();
    }
}
