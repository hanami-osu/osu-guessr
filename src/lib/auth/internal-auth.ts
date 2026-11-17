import crypto from "crypto";

/** Checks the `Bearer` secret Hanami Web sends on internal requests, in constant time. */
export function hasValidInternalSecret(header: string | null, secret: string): boolean {
    const match = header?.match(/^Bearer (.+)$/);
    if (!match) return false;

    const expected = crypto.createHash("sha256").update(secret).digest();
    const received = crypto.createHash("sha256").update(match[1]).digest();
    return crypto.timingSafeEqual(expected, received);
}
