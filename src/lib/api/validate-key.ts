import "server-only";

import redisClient from "@/lib/infra/redis";
import { query } from "../database";
import { validateApiKeyValue } from "./key-validation";

export function validateApiKey(apiKey?: string | null): Promise<number> {
    return validateApiKeyValue(apiKey, { query, redis: redisClient });
}
