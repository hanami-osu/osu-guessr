import { describe, expect, spyOn, test } from "bun:test";
import { ApiRateLimitError, ApiValidationServiceError, InvalidApiKeyError, MissingApiKeyError } from "@/lib/api/errors";
import { validateApiKeyValue } from "@/lib/api/key-validation";

const validKeyRow = { userId: 123, lastUsed: new Date() };

function dependencies({ row = validKeyRow, requestCount = 1, databaseError, redisError }: { row?: typeof validKeyRow | null; requestCount?: number; databaseError?: Error; redisError?: Error } = {}) {
    return {
        findActiveKey: async () => {
            if (databaseError) throw databaseError;
            return row;
        },
        recordUse: async () => {},
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
        await expect(validateApiKeyValue("key", dependencies({ databaseError: new Error("database unavailable") }))).rejects.toBeInstanceOf(ApiValidationServiceError);
        await expect(validateApiKeyValue("key", dependencies({ redisError: new Error("redis unavailable") }))).rejects.toBeInstanceOf(ApiValidationServiceError);
        consoleError.mockRestore();
    });
});
