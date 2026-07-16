import type { User } from "@/generated/prisma/client";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import type { HanamiIdentityClaims } from "./claims";
import { writeIdentityAuditEvent } from "./audit";
import {
    claimGuessrUserWithRepository,
    GuessrIdentityConflictError,
    type GuessrIdentityClaimResult,
    type GuessrIdentityRepository,
} from "./claim-core";

export { claimGuessrUserWithRepository, GuessrIdentityConflictError } from "./claim-core";
export type { GuessrIdentityClaimResult, GuessrIdentityRepository } from "./claim-core";

type IdentityClient = PrismaClient | Prisma.TransactionClient;

function profileData(claims: HanamiIdentityClaims) {
    return {
        ...(claims.name ? { username: claims.name } : {}),
        ...(claims.image ? { avatarUrl: claims.image } : {}),
    };
}

function createRepository(client: IdentityClient): GuessrIdentityRepository {
    return {
        findByHanamiUserId: (hanamiUserId) => client.user.findUnique({ where: { hanamiUserId } }),
        findByBanchoId: (banchoId) => client.user.findUnique({ where: { banchoId } }),
        create: (claims) =>
            client.user.create({
                data: {
                    banchoId: claims.banchoId,
                    hanamiUserId: claims.hanamiUserId,
                    username: claims.name ?? `osu! user ${claims.banchoId}`,
                    avatarUrl: claims.image ?? `https://a.ppy.sh/${claims.banchoId}`,
                },
            }),
        claimUnclaimed: async (claims) => {
            const result = await client.user.updateMany({
                where: {
                    banchoId: claims.banchoId,
                    hanamiUserId: null,
                },
                data: {
                    hanamiUserId: claims.hanamiUserId,
                    ...profileData(claims),
                },
            });
            return result.count;
        },
        updateProfile: async (banchoId, claims) => {
            const data = profileData(claims);
            if (Object.keys(data).length === 0) {
                const existing = await client.user.findUnique({ where: { banchoId } });
                if (!existing) throw new Error("Claimed osu!guessr user disappeared");
                return existing;
            }
            return client.user.update({ where: { banchoId }, data });
        },
    };
}

function isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function reconcileConcurrentClaim(claims: HanamiIdentityClaims): Promise<GuessrIdentityClaimResult> {
    const [byHanamiId, byBanchoId] = await Promise.all([
        prisma.user.findUnique({ where: { hanamiUserId: claims.hanamiUserId } }),
        prisma.user.findUnique({ where: { banchoId: claims.banchoId } }),
    ]);

    if (byHanamiId && byBanchoId && byHanamiId.banchoId === byBanchoId.banchoId && byBanchoId.hanamiUserId === claims.hanamiUserId) {
        return {
            user: await prisma.user.update({
                where: { banchoId: claims.banchoId },
                data: profileData(claims),
            }),
            outcome: "existing",
        };
    }

    throw new GuessrIdentityConflictError("concurrent_unique_constraint_conflict");
}

export async function claimGuessrUser(claims: HanamiIdentityClaims): Promise<GuessrIdentityClaimResult> {
    try {
        const result = await prisma.$transaction(
            (transaction) => claimGuessrUserWithRepository(claims, createRepository(transaction)),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        if (result.outcome !== "existing") {
            writeIdentityAuditEvent({
                eventType: "guessr_identity_claim",
                outcome: "success",
                hanamiUserId: claims.hanamiUserId,
                externalId: claims.banchoId.toString(),
            });
        }
        return result;
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            try {
                return await reconcileConcurrentClaim(claims);
            } catch (reconciliationError) {
                if (reconciliationError instanceof GuessrIdentityConflictError) {
                    writeIdentityAuditEvent({
                        eventType: "guessr_claim_conflict",
                        outcome: "blocked",
                        hanamiUserId: claims.hanamiUserId,
                        externalId: claims.banchoId.toString(),
                        errorCode: reconciliationError.code,
                    });
                }
                throw reconciliationError;
            }
        }

        if (error instanceof GuessrIdentityConflictError) {
            writeIdentityAuditEvent({
                eventType: "guessr_claim_conflict",
                outcome: "blocked",
                hanamiUserId: claims.hanamiUserId,
                externalId: claims.banchoId.toString(),
                errorCode: error.code,
            });
        }
        throw error;
    }
}

export function resolveGuessrUserByHanamiId(hanamiUserId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { hanamiUserId } });
}
