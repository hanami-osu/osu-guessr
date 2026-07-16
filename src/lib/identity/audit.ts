import { createHash, randomUUID } from "crypto";

type IdentityAuditOutcome = "success" | "blocked" | "failure";

interface IdentityAuditEvent {
    eventType: "guessr_identity_claim" | "guessr_claim_conflict" | "guessr_account_deletion";
    outcome: IdentityAuditOutcome;
    hanamiUserId?: string;
    externalId?: string;
    correlationId?: string;
    errorCode?: string;
}

function hashIdentifier(identifier: string): string {
    return createHash("sha256").update(identifier).digest("hex");
}

export function writeIdentityAuditEvent(event: IdentityAuditEvent): void {
    try {
        const record = {
            eventType: event.eventType,
            canonicalUserHash: event.hanamiUserId ? hashIdentifier(event.hanamiUserId) : undefined,
            externalIdentifierHash: event.externalId ? hashIdentifier(event.externalId) : undefined,
            correlationId: event.correlationId ?? randomUUID(),
            sourceService: "osu-guessr",
            provider: "hanami",
            outcome: event.outcome,
            errorCode: event.errorCode,
            timestamp: new Date().toISOString(),
        };

        if (event.outcome === "success") {
            console.info("Identity audit event", record);
        } else {
            console.warn("Identity audit event", record);
        }
    } catch (error) {
        console.error("Identity audit sink failed", {
            eventType: event.eventType,
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
    }
}
