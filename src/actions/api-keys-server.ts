"use server";

import { authenticatedAction } from "./server";
import { query } from "@/lib/database";
import redisClient from "@/lib/redis";
import crypto from "crypto";
import { validateApiKeyValue } from "@/lib/api/key-validation";

import type { ApiKey } from "./types";

export type { ApiKey };

function hashApiKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export async function createApiKeyAction(name: string): Promise<string> {
    return authenticatedAction(async ({ guessrUser }) => {
        const [result] = (await query(`SELECT COUNT(*) as count FROM api_keys WHERE user_id = ?`, [guessrUser.banchoId])) as [{ count: number }];

        if (result.count >= 5) {
            throw new Error("Maximum number of API keys (5) reached");
        }

        const apiKey = crypto.randomBytes(32).toString("hex");
        const hashedKey = hashApiKey(apiKey);

        await query(`INSERT INTO api_keys (id, user_id, name) VALUES (?, ?, ?)`, [hashedKey, guessrUser.banchoId, name]);

        return apiKey;
    });
}

export async function listApiKeysAction() {
    return authenticatedAction(async ({ guessrUser }) => {
        const keys: Array<ApiKey> = await query(
            `SELECT id, name, created_at, last_used
                FROM api_keys
                WHERE user_id = ?
                ORDER BY created_at DESC`,
            [guessrUser.banchoId]
        );

        return keys;
    });
}

export async function deleteApiKeyAction(keyId: string): Promise<void> {
    return authenticatedAction(async ({ guessrUser }) => {
        await query(
            `DELETE FROM api_keys
            WHERE id = ? AND user_id = ?`,
            [keyId, guessrUser.banchoId]
        );
    });
}

export async function validateApiKey(apiKey?: string | null): Promise<number> {
    return validateApiKeyValue(apiKey, {
        query: (sql, values) => query(sql, values),
        redis: redisClient,
    });
}
