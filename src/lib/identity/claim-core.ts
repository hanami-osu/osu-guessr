import type { User } from "@/generated/prisma/client";
import type { HanamiIdentityClaims } from "./claims";

export type GuessrIdentityClaimResult = {
    user: User;
    outcome: "existing" | "claimed" | "created";
};

export class GuessrIdentityConflictError extends Error {
    constructor(public readonly code: string) {
        super("This osu!guessr profile is already assigned to another Hanami account.");
        this.name = "GuessrIdentityConflictError";
    }
}

export interface GuessrIdentityRepository {
    findByHanamiUserId(hanamiUserId: string): Promise<User | null>;
    findByBanchoId(banchoId: number): Promise<User | null>;
    create(claims: HanamiIdentityClaims): Promise<User>;
    claimUnclaimed(claims: HanamiIdentityClaims): Promise<number>;
    updateProfile(banchoId: number, claims: HanamiIdentityClaims): Promise<User>;
}

export async function claimGuessrUserWithRepository(claims: HanamiIdentityClaims, repository: GuessrIdentityRepository): Promise<GuessrIdentityClaimResult> {
    const [byHanamiId, byBanchoId] = await Promise.all([
        repository.findByHanamiUserId(claims.hanamiUserId),
        repository.findByBanchoId(claims.banchoId),
    ]);

    if (byHanamiId && byHanamiId.banchoId !== claims.banchoId) {
        throw new GuessrIdentityConflictError("hanami_id_owned_by_another_osu_id");
    }

    if (byBanchoId?.hanamiUserId && byBanchoId.hanamiUserId !== claims.hanamiUserId) {
        throw new GuessrIdentityConflictError("osu_id_owned_by_another_hanami_id");
    }

    if (byBanchoId) {
        if (!byBanchoId.hanamiUserId) {
            const claimed = await repository.claimUnclaimed(claims);
            if (claimed !== 1) {
                const concurrentOwner = await repository.findByBanchoId(claims.banchoId);
                if (concurrentOwner?.hanamiUserId !== claims.hanamiUserId) {
                    throw new GuessrIdentityConflictError("concurrent_claim_conflict");
                }
            }

            return {
                user: await repository.updateProfile(claims.banchoId, claims),
                outcome: "claimed",
            };
        }

        return {
            user: await repository.updateProfile(claims.banchoId, claims),
            outcome: "existing",
        };
    }

    return {
        user: await repository.create(claims),
        outcome: "created",
    };
}
