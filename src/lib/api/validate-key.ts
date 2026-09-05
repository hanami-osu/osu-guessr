import "server-only";

import redisClient from "@/lib/redis";
import { query } from "@/lib/database";
import { validateApiKeyValue } from "./key-validation";

export function validateApiKey(apiKey?: string | null): Promise<number> {
    return validateApiKeyValue(apiKey, { query, redis: redisClient });
}
