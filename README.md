# osu!guessr

Guess osu! songs from beatmap backgrounds or audio clips, and skins from screenshots. Play in your browser.

## Features

- **Background Guessr**: identify songs from beatmap backgrounds.
- **Audio Guessr**: identify songs from audio clips.
- **Skin Guessr**: identify community skins from screenshots.
- Classic and survival variants, leaderboards, profiles, game statistics, reports, and API keys.
- English, Turkish, Czech, Spanish, Polish, and Russian interfaces.

## Documentation

- [API documentation](./docs/API.md)
- [Translation guide](./docs/TRANSLATING.md)

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- MariaDB or MySQL
- Redis
- A public Hanami OIDC client and legacy osu! API key

## Local development

1. Clone the canonical repository and install dependencies:

    ```bash
    git clone https://github.com/hanami-osu/osu-guessr.git
    cd osu-guessr
    bun install
    ```

2. Create the local environment file:

    ```bash
    cp .env.template .env
    ```

3. Configure at least the following values in `.env`:

    ```env
    PORT=3000

    HANAMI_ISSUER="https://hanami.yorunoken.com/api/auth"
    HANAMI_CLIENT_ID="your_public_client_id"
    OSU_API_KEY="your_api_key"

    NEXTAUTH_URL="http://localhost:3000"
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    AUTH_SECRET="a_random_secret"
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="a_stable_random_key"

    DATABASE_URL="mysql://user:password@127.0.0.1:3306/osu_guessr"
    REDIS_URL="redis://127.0.0.1:6379"
    ```

    Configure the public OIDC client in Hanami with the local callback URL `http://localhost:3000/api/auth/callback/hanami` for development and the production callback URL `https://your-domain.com/api/auth/callback/hanami` for deployment. Generate independent secrets for `AUTH_SECRET` and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; do not reuse the placeholders in production.

    `DISCORD_WEBHOOK` is optional. Reports are stored even when it is unset; the variable only enables Discord notifications.

4. Prepare a database.

    > [!CAUTION]
    > `init.sql` is only for a brand-new, disposable development database. It disables foreign-key checks and drops existing application tables before recreating them. Never run it against an existing, shared, staging, or production database. A migration-based installation path is tracked separately and is not replaced by this command.

    For a fresh disposable development database only:

    ```bash
    mysql -u your_database_user -p osu_guessr < init.sql
    bun run prisma:generate
    ```

    Existing environments are migrated automatically when the production container starts. `bun run db:introspect` reads an existing database into `prisma/schema.prisma`; it is not a migration command.

5. Start the development server:

    ```bash
    bun run dev
    ```

## Validation

Run the same quality gates used for changes:

```bash
bun run check
bun run test
bun run build
```

## Production notes

- Use production-specific secrets and HTTPS URLs.
- Keep `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable across replicas and deployments.
- Back MariaDB, Redis, and imported media with appropriate persistent storage.
- Do not use `init.sql` to update an existing deployment.
- A production container acquires a database lock and applies missing files from `migrations/` before starting the server. If a migration fails, the server does not start.
- Run only one app container while migrations execute. Scale it after startup if a future deployment adds replicas.
- Conflicting legacy `mapset_tags` duplicates must be resolved manually if startup reports them. Successful migration keeps the original rows in `mapset_tags_before_20260905` for recovery.
- Treat applied migration files as immutable. Add a new migration for later schema changes.

## Built with

- [Next.js 16](https://nextjs.org/)
- [React 19](https://react.dev/)
- [NextAuth.js](https://authjs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Prisma](https://www.prisma.io/)
- [MariaDB](https://mariadb.org/)
- [TypeScript](https://www.typescriptlang.org/)

## License

Copyright © 2026 yorunoken and hanami-osu contributors.

This project is licensed under the GNU Affero General Public License version 3 only (`AGPL-3.0-only`). See [LICENSE](./LICENSE) and [LICENSING.md](./LICENSING.md) for the full terms, third-party material, contribution licensing, and branding policy.

## Contact

- [GitHub issues](https://github.com/hanami-osu/osu-guessr/issues)
- [@_yorunoken on Twitter](https://twitter.com/_yorunoken)
