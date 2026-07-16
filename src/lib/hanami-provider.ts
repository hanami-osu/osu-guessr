import { parseHanamiIdentityClaims } from "@/lib/identity/claims";
import type { OIDCConfig } from "next-auth/providers";

type HanamiOidcProfile = Record<string, unknown>;

export interface HanamiProviderConfiguration {
    issuer: string;
    clientId: string;
    clientSecret: string;
}

export function buildHanamiProvider(configuration: HanamiProviderConfiguration): OIDCConfig<HanamiOidcProfile> {
    return {
        id: "hanami",
        name: "Hanami",
        type: "oidc",
        issuer: configuration.issuer,
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        authorization: {
            params: {
                scope: "openid profile osu.identity",
                response_type: "code",
            },
        },
        checks: ["pkce", "state", "nonce"],
        profile(profile) {
            const claims = parseHanamiIdentityClaims(profile);
            return {
                id: claims.hanamiUserId,
                name: claims.name,
                email: null,
                image: claims.image,
                hanamiUserId: claims.hanamiUserId,
                banchoId: claims.banchoId,
            };
        },
    };
}
