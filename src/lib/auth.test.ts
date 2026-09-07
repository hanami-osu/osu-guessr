import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { Profile } from "next-auth";

const upsertUserMock = mock(async () => {});
type TestProvider = {
    id: string;
    name: string;
    type: string;
    issuer: string;
    clientId: string;
    checks: string[];
    authorization: { params: { scope: string } };
    client: { token_endpoint_auth_method: string };
    clientSecret?: string;
    profile: (profile: Profile, tokens: unknown) => { id: string; name: string; image: string };
};
type TestAuthConfig = {
    providers: TestProvider[];
    callbacks: {
        jwt: (args: { token: Record<string, unknown>; profile?: Profile }) => Promise<Record<string, unknown>>;
        session: (args: { session: { expires: string; user?: Record<string, unknown> }; token: Record<string, unknown> }) => {
            expires: string;
            user: Record<string, unknown>;
        };
    };
};
let authConfig: TestAuthConfig;

mock.module("@/lib/env", () => ({
    env: {
        HANAMI_ISSUER: "https://hanami.example.com/api/auth",
        HANAMI_CLIENT_ID: "client-id",
    },
}));
mock.module("@/lib/user-service", () => ({ upsertUser: upsertUserMock }));
mock.module("next-auth", () => ({
    default: (config: TestAuthConfig) => {
        authConfig = config;
        return { auth: mock(), handlers: { GET: mock(), POST: mock() } };
    },
}));

beforeAll(async () => {
    await import("./auth");
});

describe("Hanami authentication configuration", () => {
    test("uses the public Hanami OIDC provider with the approved authorization contract", () => {
        const [provider] = authConfig.providers;

        expect(provider).toMatchObject({
            id: "hanami",
            name: "Hanami",
            type: "oidc",
            issuer: "https://hanami.example.com/api/auth",
            clientId: "client-id",
            checks: ["pkce", "state"],
            authorization: { params: { scope: "openid osu" } },
            client: { token_endpoint_auth_method: "none" },
        });
        expect(provider.clientSecret).toBeUndefined();
    });

    test("keeps only the osu identity fields needed by the application session", async () => {
        const token = await authConfig.callbacks.jwt({
            token: {
                sub: "hanami-sub",
                email: "user@example.com",
                access_token: "upstream-token",
            },
            profile: {
                "https://hanami.yorunoken.com/claims/osu_id": "123",
                "https://hanami.yorunoken.com/claims/osu_username": "player",
                "https://hanami.yorunoken.com/claims/osu_avatar": "https://osu.ppy.sh/avatar/123",
                sub: "hanami-sub",
            },
        });

        expect(token).toEqual({
            banchoId: 123,
            name: "player",
            picture: "https://osu.ppy.sh/avatar/123",
        });
        expect(upsertUserMock).toHaveBeenCalledWith(123, "player", "https://osu.ppy.sh/avatar/123");
    });

    test("exposes only the local user identity in the application session", () => {
        const session = authConfig.callbacks.session({
            session: { expires: "2099-01-01T00:00:00.000Z", user: { email: "user@example.com" } },
            token: {
                sub: "hanami-sub",
                email: "user@example.com",
                access_token: "upstream-token",
                banchoId: 123,
                name: "player",
                picture: "https://osu.ppy.sh/avatar/123",
            },
        });

        expect(session).toEqual({
            expires: "2099-01-01T00:00:00.000Z",
            user: {
                banchoId: 123,
                name: "player",
                image: "https://osu.ppy.sh/avatar/123",
            },
        });
    });

    test("maps Hanami claims to the existing user profile contract", async () => {
        const [provider] = authConfig.providers;

        expect(provider.profile({
            "https://hanami.yorunoken.com/claims/osu_id": "123",
            "https://hanami.yorunoken.com/claims/osu_username": "player",
            "https://hanami.yorunoken.com/claims/osu_avatar": "https://osu.ppy.sh/avatar/123",
        }, {})).toEqual({
            id: "123",
            name: "player",
            image: "https://osu.ppy.sh/avatar/123",
        });
    });

    test.each([
        ["missing osu id", { "https://hanami.yorunoken.com/claims/osu_username": "player" }],
        ["non-canonical osu id", {
            "https://hanami.yorunoken.com/claims/osu_id": "00123",
            "https://hanami.yorunoken.com/claims/osu_username": "player",
        }],
        ["unsafe osu id", {
            "https://hanami.yorunoken.com/claims/osu_id": "9007199254740992",
            "https://hanami.yorunoken.com/claims/osu_username": "player",
        }],
        ["missing username", { "https://hanami.yorunoken.com/claims/osu_id": "123" }],
        ["empty username", {
            "https://hanami.yorunoken.com/claims/osu_id": "123",
            "https://hanami.yorunoken.com/claims/osu_username": "",
        }],
        ["invalid avatar", {
            "https://hanami.yorunoken.com/claims/osu_id": "123",
            "https://hanami.yorunoken.com/claims/osu_username": "player",
            "https://hanami.yorunoken.com/claims/osu_avatar": "javascript:alert(1)",
        }],
    ])("rejects %s Hanami claims", async (_reason, profile) => {
        const [provider] = authConfig.providers;

        expect(() => provider.profile(profile, {})).toThrow();
    });

    test("uses the local avatar placeholder when Hanami omits the avatar claim", async () => {
        const [provider] = authConfig.providers;

        expect(provider.profile({
            "https://hanami.yorunoken.com/claims/osu_id": "123",
            "https://hanami.yorunoken.com/claims/osu_username": "player",
        }, {})).toEqual({
            id: "123",
            name: "player",
            image: "/default-avatar.svg",
        });
    });
});
