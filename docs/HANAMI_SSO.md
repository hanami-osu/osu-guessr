# Hanami SSO integration

## Profile portal discovery

The authenticated Guessr settings page includes a `Manage Hanami account` action when `HANAMI_WEB_URL` is configured. It opens the exact Hanami Web `/profile` path and passes no osu! ID, username, access token, session, or identity assertion in the URL.

This portal link is discovery only. Existing Guessr users can choose `Continue with osu!` on Hanami Web so the provider identity resolves to its canonical Hanami account. A seamless cross-site session handoff without another provider prompt is a later phase; the link itself does not enable or depend on the feature-flagged OIDC migration described below.

osu!guessr keeps `users.bancho_id` as its local primary key so existing games, achievements, badges, reports, API keys, leaderboard history, and profile data keep their current ownership. The nullable, unique `users.hanami_user_id` column records the canonical Hanami Web Better Auth `user.id`.

## OIDC client contract

Hanami Web must register osu!guessr as a confidential client with the exact callback URI:

```text
https://<guessr-host>/api/auth/callback/hanami
```

osu!guessr requests the authorization-code flow with these scopes:

```text
openid profile osu.identity
```

The ID token and user-info response must provide:

- `sub`: canonical Hanami user ID;
- `osu_id`: linked decimal osu! user ID;
- `account_complete`: the boolean value `true`;
- optional `name` and `picture` profile claims.

Auth.js performs discovery, signature, issuer, audience, expiry, state, nonce, and PKCE `S256` validation. The application rejects missing canonical claims, incomplete accounts, malformed osu! IDs, and tokens from sessions created before Hanami SSO cutover.

## Environment

```env
GUESSR_HANAMI_SSO_ENABLED="false"
HANAMI_ISSUER="https://accounts.example.com"
HANAMI_CLIENT_ID="osu-guessr"
HANAMI_CLIENT_SECRET="..."
```

`HANAMI_ISSUER` must be the exact HTTPS issuer in production. The client secret is server-only. Do not prefix it with `NEXT_PUBLIC_` or expose it to React.

While `GUESSR_HANAMI_SSO_ENABLED=false`, the existing direct osu! provider remains available for deployment compatibility and needs `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET`. Enabling the flag removes that provider from the runtime configuration and enables only Hanami.

## Existing-user claim

On the first successful Hanami login, osu!guessr reads ownership only from validated `sub` and `osu_id` claims. It finds the existing local row by `bancho_id` and conditionally assigns `hanami_user_id` inside a serializable database transaction. A repeated login by the same pair succeeds. A row assigned to either a different canonical ID or a different osu! ID fails closed and records a redacted audit event. History is never transferred between rows.

The local session contains both `hanamiUserId` and `banchoId`. Private actions first resolve the local user by `hanamiUserId` and verify that the stored `bancho_id` matches the trusted claim. Public profile and leaderboard lookups may continue to accept osu! IDs.

## Schema rollout

Deploy the additive migration before enabling SSO:

```bash
bun run prisma:generate
bun run prisma:validate
bun run db:migrate:deploy
```

The migration adds one nullable column and one unique index. It does not rewrite keys, delete rows, or touch dependent history tables. `init.sql` is still only for a brand-new disposable development database.

Recommended rollout:

1. Deploy the additive migration and application code with SSO disabled.
2. Register the exact issuer, client ID, secret, callback URI, and scopes in Hanami Web.
3. Verify OIDC discovery and a test account in a non-production environment.
4. Enable `GUESSR_HANAMI_SSO_ENABLED` and restart all replicas together.
5. Confirm old sessions are rejected and both existing-user claims and new-user creation work.
6. Remove the legacy osu! provider compatibility branch in a later cleanup after observation.

## Session cutover and rollback

Hanami sessions carry identity session version `1`. When SSO is enabled, JWTs without that version and canonical ID return no session, so existing direct-osu sessions must sign in again. `AUTH_SECRET` does not need to rotate solely for this cutover.

For application rollback, disable `GUESSR_HANAMI_SSO_ENABLED` and redeploy the previous authentication mode. Leave `hanami_user_id` and its unique index in place; they are additive and preserve completed claims. Do not drop the column during an incident. If a claim conflict occurs, correct it only through an operator-reviewed process; never transfer history automatically.

## Data ownership

osu!guessr owns games, achievements, badges, reports, API keys, leaderboard history, and Guessr profile metadata. Hanami Web owns the canonical account and provider identities. Account export or deletion orchestration must address both services by canonical `hanami_user_id`; this repository does not expose an unauthenticated deletion endpoint.
