import { describe, expect, test } from "bun:test";
import { buildHanamiProvider } from "./hanami-provider";

describe("Hanami OIDC provider", () => {
    const provider = buildHanamiProvider({
        issuer: "https://accounts.hanami.example",
        clientId: "osu-guessr",
        clientSecret: "test-secret",
    });

    test("uses discovery, authorization code, narrow scopes, and all required checks", () => {
        expect(provider.type).toBe("oidc");
        expect(provider.issuer).toBe("https://accounts.hanami.example");
        expect(provider.clientId).toBe("osu-guessr");
        expect(provider.checks).toEqual(["pkce", "state", "nonce"]);
        expect(provider.authorization).toEqual({
            params: {
                scope: "openid profile osu.identity",
                response_type: "code",
            },
        });
    });

    test("maps only canonical and profile claims into the Auth.js user", async () => {
        const profileMapper = provider.profile as (profile: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
        const user = await profileMapper({
            sub: "hanami-user-123",
            osu_id: "17279598",
            account_complete: true,
            name: "player",
            picture: "https://a.ppy.sh/17279598",
            discord_id: "not-for-guessr",
        });

        expect(user).toMatchObject({
            id: "hanami-user-123",
            hanamiUserId: "hanami-user-123",
            banchoId: 17279598,
        });
        expect(user).not.toHaveProperty("discord_id");
    });
});
