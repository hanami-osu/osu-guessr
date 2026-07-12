# Deployment notes

## Health checks

`GET /api/health` checks both Redis and MariaDB with short timeouts. It returns `200` only when both required dependencies are available and `503` otherwise. The response includes the deployment ID and simple per-dependency `ok` or `unavailable` states; it does not include credentials, connection strings, or internal exception messages.

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

The Docker publishing workflow runs `bun run check`, `bun test`, and `bun run build` before the Docker job. Image login, build, and push steps do not run when the quality job fails.
