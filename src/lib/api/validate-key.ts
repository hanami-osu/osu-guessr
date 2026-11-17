import "server-only";

import redisClient from "@/lib/infra/redis";
import { prisma } from "@/lib/database/prisma";
import { validateApiKeyValue } from "./key-validation";

export function validateApiKey(apiKey?: string | null): Promise<number> {
    return validateApiKeyValue(apiKey, {
        redis: redisClient,
        findActiveKey: (id) => prisma.apiKey.findUnique({
            where: { id, user: { deletionScheduledAt: null } },
            select: { userId: true, lastUsed: true },
        }),
        recordUse: (id, lastUsed) => prisma.apiKey.updateMany({ where: { id }, data: { lastUsed } }),
    });
}
