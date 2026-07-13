# osu!guessr API

The public API returns JSON and requires an API key in the `X-API-Key` header. Signed-in users can create API keys from the settings page.

```http
X-API-Key: your_api_key
```

User IDs are positive osu! user IDs. Unless noted otherwise, timestamps are ISO 8601 strings and database aggregate values are serialized as JSON numbers.

## Endpoints

### Get a user

```http
GET /api/users/{userId}
```

```typescript
{
    success: true;
    data: {
        bancho_id: number;
        username: string;
        avatar_url: string;
        created_at: string;
        badges: Array<{
            name: string;
            color: string;
            assigned_at: string;
        }>;
        achievements: Array<{
            user_id: number;
            game_mode: "background" | "audio" | "skin";
            variant: "classic" | "death";
            total_score: number;
            games_played: number;
            highest_streak: number;
            highest_score: number;
            last_played: string;
        }>;
        ranks: {
            globalRank?: {
                classic?: number;
                death?: number;
            };
            modeRanks: {
                background: { classic?: number; death?: number };
                audio: { classic?: number; death?: number };
                skin: { classic?: number; death?: number };
            };
        };
    };
}
```

Returns `404` when the user does not exist. Rank fields can be absent when the user is unranked.

### Get a user's games

```http
GET /api/users/{userId}/games
```

Query parameters:

- `mode` (optional): `background`, `audio`, or `skin`.
- `variant` (optional): `classic` or `death`; defaults to `classic`.
- `limit` (optional): integer from 1 to 100; defaults to 20.
- `offset` (optional): non-negative integer; defaults to 0.

```typescript
{
    success: true;
    data: Array<{
        user_id: number;
        game_mode: "background" | "audio" | "skin";
        points: number;
        streak: number;
        variant: "classic" | "death";
        ended_at: string;
    }>;
    meta: {
        total: number;
        offset: number;
        limit: number;
    };
}
```

### Get a user's statistics

```http
GET /api/users/{userId}/stats
```

Query parameters:

- `mode` (optional): `background`, `audio`, or `skin`.

```typescript
{
    success: true;
    data: Array<{
        user_id: number;
        game_mode: "background" | "audio" | "skin";
        total_score: number;
        games_played: number;
        highest_streak: number;
        highest_score: number;
        last_played: string;
    }>;
}
```

This route currently returns one array entry per stored user-achievement row. The current query does not include a `variant` field.

### Search users

```http
GET /api/users/search?query=player
```

Query parameters:

- `query` (required): 2 to 250 characters.
- `limit` (optional): integer from 1 to 100; defaults to 20.

```typescript
{
    success: true;
    data: Array<{
        bancho_id: number;
        username: string;
        avatar_url: string;
        created_at: string;
    }>;
}
```

### Get the leaderboard

```http
GET /api/games/leaderboard
```

Query parameters:

- `mode` (optional): `background`, `audio`, or `skin`; defaults to `background`.
- `variant` (optional): `classic` or `death`; defaults to `classic`.
- `limit` (optional): integer from 1 to 100; defaults to 100.

```typescript
{
    success: true;
    data: Array<{
        bancho_id: number;
        username: string;
        avatar_url: string;
        created_at: string;
        total_score: number;
        games_played: number;
        highest_streak: number;
        highest_score: number;
        earliest_ended_at: string;
        badges: Array<{
            name: string;
            color: string;
        }>;
    }>;
}
```

The selected variant determines the calculation but is not currently repeated as a property on each leaderboard row.

### Get global statistics

```http
GET /api/stats
```

Query parameters:

- `variant` (optional): `classic` or `death`; defaults to `classic`.

```typescript
{
    success: true;
    data: {
        highest_points: number;
        total_games: number;
        total_users: number;
    };
}
```

## Response format

Successful responses use:

```json
{
    "success": true,
    "data": {}
}
```

Errors use:

```json
{
    "success": false,
    "error": "Error message"
}
```

HTTP statuses:

- `200`: success.
- `400`: malformed path or query parameters.
- `401`: API key missing.
- `403`: API key invalid.
- `404`: requested resource not found.
- `429`: API key rate limit exceeded.
- `500`: unexpected internal failure.
- `503`: API-key validation dependency unavailable.

## Rate limits

Each API key is limited to 120 requests per 60-second fixed window. Requests above that limit return `429`. Rate limiting requires Redis; a Redis or database failure during API-key validation returns an internal-service error rather than an invalid-key response.

## Support

Open questions and bug reports in the [canonical GitHub repository](https://github.com/hanami-osu/osu-guessr/issues).
