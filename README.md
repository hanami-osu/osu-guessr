# osu!guessr

osu!guessr is a browser guessing game for identifying osu! beatmaps from backgrounds, audio clips, and skin screenshots.

## Features

- **Background Guessr**: identify songs from beatmap backgrounds.
- **Audio Guessr**: identify songs from audio clips.
- **Skin Guessr**: identify community skins from screenshots.
- Classic and death variants, leaderboards, profiles, achievements, reports, and API keys.
- English, Turkish, Czech, Spanish, Polish, and Russian interfaces.

## Documentation

- [API documentation](./docs/API.md)
- [Translation guide](./docs/TRANSLATING.md)

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- MariaDB or MySQL
- Redis
- An osu! OAuth application and legacy API key

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

    OSU_CLIENT_ID="your_client_id"
    OSU_CLIENT_SECRET="your_client_secret"
    OSU_API_KEY="your_api_key"

    NEXTAUTH_URL="http://localhost:3000"
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    AUTH_SECRET="a_random_secret"
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="a_stable_random_key"

    DATABASE_URL="mysql://user:password@127.0.0.1:3306/osu_guessr"
    REDIS_URL="redis://127.0.0.1:6379"
    ```

    Register an osu! OAuth application at [osu! account settings](https://osu.ppy.sh/home/account/edit#oauth). Generate independent secrets for `AUTH_SECRET` and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; do not reuse the placeholders in production.

    `DISCORD_WEBHOOK` is optional. Reports are stored even when it is unset; the variable only enables Discord notifications.

4. Prepare a database.

    > [!CAUTION]
    > `init.sql` is only for a brand-new, disposable development database. It disables foreign-key checks and drops existing application tables before recreating them. Never run it against an existing, shared, staging, or production database. A migration-based installation path is tracked separately and is not replaced by this command.

    For a fresh disposable development database only:

    ```bash
    mysql -u your_database_user -p osu_guessr < init.sql
    bun run prisma:generate
    ```

    Existing environments must use their established schema-management process. `bun run db:introspect` reads an existing database into `prisma/schema.prisma`; it is not a migration command.

5. Start the development server:

    ```bash
    bun run dev
    ```

## Validation

Run the same quality gates used for changes:

```bash
bun run check
bun test
bun run build
```

## Production notes

- Use production-specific secrets and HTTPS URLs.
- Keep `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable across replicas and deployments.
- Back MariaDB, Redis, and imported media with appropriate persistent storage.
- Do not use `init.sql` to update an existing deployment.

## Built with

- [Next.js 16](https://nextjs.org/)
- [React 19](https://react.dev/)
- [NextAuth.js](https://authjs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Prisma](https://www.prisma.io/)
- [MariaDB](https://mariadb.org/)
- [TypeScript](https://www.typescriptlang.org/)

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

## Contact

- [GitHub issues](https://github.com/hanami-osu/osu-guessr/issues)
- [@_yorunoken on Twitter](https://twitter.com/_yorunoken)
