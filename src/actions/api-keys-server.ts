"use server";

import { authenticatedAction } from "./server";
import { prisma } from "@/lib/database/prisma";
import crypto from "crypto";

import type { ApiKey } from "./types";

export type { ApiKey };

function hashApiKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export async function createApiKeyAction(name: string): Promise<string> {
    return authenticatedAction(async (session) => {
        const count = await prisma.apiKey.count({ where: { userId: session.user.banchoId } });

        if (count >= 5) {
            throw new Error("Maximum number of API keys (5) reached");
        }

        const apiKey = crypto.randomBytes(32).toString("hex");
        const hashedKey = hashApiKey(apiKey);

        await prisma.apiKey.create({ data: { id: hashedKey, userId: session.user.banchoId, name } });

        return apiKey;
    });
}

export async function listApiKeysAction() {
    return authenticatedAction(async (session) => {
        const keys = await prisma.apiKey.findMany({
            where: { userId: session.user.banchoId },
            select: { id: true, name: true, createdAt: true, lastUsed: true },
            orderBy: { createdAt: "desc" },
        });
        return keys.map(({ id, name, createdAt, lastUsed }) => ({ id, name, created_at: createdAt, last_used: lastUsed }));
    });
}

export async function deleteApiKeyAction(keyId: string): Promise<void> {
    return authenticatedAction(async (session) => {
        await prisma.apiKey.deleteMany({ where: { id: keyId, userId: session.user.banchoId } });
    });
}
