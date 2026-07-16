# Deployment notes

## Health checks

`GET /api/health` checks both Redis and MariaDB with short timeouts. It returns `200` only when both required dependencies are available and `503` otherwise. The response includes the deployment ID and simple per-dependency `ok` or `unavailable` states; it does not include credentials, connection strings, or internal exception messages.

The response stops waiting for either dependency after two seconds. This bounds the health request, but it does not cancel an underlying Redis or MariaDB operation that ignores or does not support cancellation; that operation may settle later in the background.

The container health check calls this endpoint, so an unavailable database or Redis instance makes the container unhealthy.

## Runtime directories

The runtime image creates these writable directories for the non-root `nextjs` user (UID/GID 1001):

- `/app/mapsets/audio`
- `/app/mapsets/backgrounds`
- `/app/mapsets/skins`
- `/app/tmp`

Imported media under `/app/mapsets` should normally be backed by persistent storage. A bind mount or named volume must be writable by UID/GID 1001. The `/app/tmp` directory can remain ephemeral unless an operator has a specific recovery requirement.

Example volume layout:

```yaml
services:
  app:
    volumes:
      - ./mapsets:/app/mapsets
      - ./tmp:/app/tmp
```

Create host bind-mount directories with appropriate ownership and permissions before starting the container. Do not make them world-writable as a shortcut.

## Publishing checks

The Docker publishing workflow runs `bun run check`, `bun test`, and `bun run build` before the Docker job. The check command generates Prisma Client before linting and type-checking, so it also works from a clean checkout. Image login, build, and push steps do not run when the quality job fails.

The quality job also creates a disposable legacy `users` table in MariaDB, applies the production identity migration, and verifies that `hanami_user_id` is nullable, 255 characters, and uniquely indexed. The guard script refuses non-local database hosts or database names that do not end in `_migration_test`.

## Hanami SSO rollout

Deploy `prisma/migrations/20260717000000_add_hanami_user_id/migration.sql` while `GUESSR_HANAMI_SSO_ENABLED=false`. Register the confidential Hanami Web client and exact `/api/auth/callback/hanami` redirect before enabling the flag. Enable all application replicas together so legacy sessions are consistently rejected.

See [Hanami SSO integration](./HANAMI_SSO.md) for claims, environment variables, staged rollout, session cutover, and rollback behavior.
