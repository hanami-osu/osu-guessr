import { describe, expect, spyOn, test } from "bun:test";
import { ApiRateLimitError, ApiValidationServiceError, InvalidApiKeyError, MissingApiKeyError } from "./errors";
import { validateApiKeyValue } from "./key-validation";

const validKeyRow = { user_id: 123, last_used: new Date() };

function dependencies({ row = validKeyRow, requestCount = 1, queryError, redisError }: { row?: typeof validKeyRow | null; requestCount?: number; queryError?: Error; redisError?: Error } = {}) {
    return {
        query: async (sql: string) => {
            if (queryError) throw queryError;
            return sql.startsWith("SELECT") && row ? [row] : [];
        },
        redis: {
            incr: async () => {
                if (redisError) throw redisError;
                return requestCount;
            },
            expire: async () => 1,
        },
    };
}

describe("validateApiKeyValue", () => {
    test("distinguishes missing, invalid, and rate-limited keys", async () => {
        await expect(validateApiKeyValue(undefined, dependencies())).rejects.toBeInstanceOf(MissingApiKeyError);
        await expect(validateApiKeyValue("invalid", dependencies({ row: null }))).rejects.toBeInstanceOf(InvalidApiKeyError);
        await expect(validateApiKeyValue("limited", dependencies({ requestCount: 121 }))).rejects.toBeInstanceOf(ApiRateLimitError);
    });

    test("maps database and Redis failures to a validation service error", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(() => {});
        await expect(validateApiKeyValue("key", dependencies({ queryError: new Error("database unavailable") }))).rejects.toBeInstanceOf(ApiValidationServiceError);
        await expect(validateApiKeyValue("key", dependencies({ redisError: new Error("redis unavailable") }))).rejects.toBeInstanceOf(ApiValidationServiceError);
        consoleError.mockRestore();
    });
});
