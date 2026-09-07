import type { Profile, User } from "next-auth";
import type { OIDCConfig } from "next-auth/providers";

export const HANAMI_CLAIMS = {
    osuId: "https://hanami.yorunoken.com/claims/osu_id",
    osuUsername: "https://hanami.yorunoken.com/claims/osu_username",
    osuAvatar: "https://hanami.yorunoken.com/claims/osu_avatar",
} as const;

export const DEFAULT_AVATAR = "/default-avatar.svg";

export interface HanamiUserProfile {
    banchoId: number;
    username: string;
    avatarUrl: string;
}

function parseOsuId(value: unknown): number {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
        return value;
    }

    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
        const parsed = Number(value);
        if (Number.isSafeInteger(parsed) && String(parsed) === value) {
            return parsed;
        }
    }

    throw new Error("Invalid Hanami osu_id claim");
}

function parseUsername(value: unknown): string {
    if (typeof value === "string" && value.trim().length > 0) {
        return value;
    }

    throw new Error("Invalid Hanami osu_username claim");
}

function parseAvatar(value: unknown): string {
    if (value === undefined) {
        return DEFAULT_AVATAR;
    }

    if (typeof value !== "string") {
        throw new Error("Invalid Hanami osu_avatar claim");
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Invalid Hanami osu_avatar claim");
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
        return value;
    }

    throw new Error("Invalid Hanami osu_avatar claim");
}

export function parseHanamiProfile(profile: Profile): HanamiUserProfile {
    return {
        banchoId: parseOsuId(profile[HANAMI_CLAIMS.osuId]),
        username: parseUsername(profile[HANAMI_CLAIMS.osuUsername]),
        avatarUrl: parseAvatar(profile[HANAMI_CLAIMS.osuAvatar]),
    };
}

export interface HanamiProviderOptions {
    issuer: string;
    clientId: string;
}

export function HanamiProvider({ issuer, clientId }: HanamiProviderOptions): OIDCConfig<Profile> {
    return {
        id: "hanami",
        name: "Hanami",
        type: "oidc",
        issuer,
        clientId,
        checks: ["pkce", "state"],
        authorization: { params: { scope: "openid osu" } },
        client: { token_endpoint_auth_method: "none" },
        profile(profile): User {
            const user = parseHanamiProfile(profile);
            return {
                id: String(user.banchoId),
                name: user.username,
                image: user.avatarUrl,
            };
        },
    };
}
