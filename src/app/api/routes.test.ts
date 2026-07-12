import { beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ApiRateLimitError, ApiValidationServiceError, InvalidApiKeyError, MissingApiKeyError } from "@/lib/api/errors";
import { GameMode } from "@/actions/types";

const validateApiKeyMock = mock(async () => 123);
const getTopPlayersMock = mock(async () => []);
const searchUsersMock = mock(async () => []);
const getUserByIdMock = mock(async () => ({ bancho_id: 123 }));
const getUserStatsMock = mock(async () => []);
const getUserLatestGamesMock = mock(async () => []);
const getUserGamesCountMock = mock(async () => 0);
const getHighestStatsMock = mock(async () => ({}));

mock.module("@/actions/api-keys-server", () => ({ validateApiKey: validateApiKeyMock }));
mock.module("@/actions/user-server", () => ({
    getTopPlayersAction: getTopPlayersMock,
    searchUsersAction: searchUsersMock,
    getUserByIdAction: getUserByIdMock,
    getUserStatsAction: getUserStatsMock,
    getUserLatestGamesAction: getUserLatestGamesMock,
    getUserGamesCountAction: getUserGamesCountMock,
    getHighestStatsAction: getHighestStatsMock,
}));

type RouteHandler = (request: Request) => Promise<Response>;
type UserRouteHandler = (request: Request, context: { params: Promise<{ userId: string }> }) => Promise<Response>;

let leaderboardGet: RouteHandler;
let searchGet: RouteHandler;
let userGet: UserRouteHandler;
let userStatsGet: UserRouteHandler;
let userGamesGet: UserRouteHandler;

const request = (path: string, withKey = true) =>
    new Request(`http://localhost${path}`, {
        headers: withKey ? { "X-API-Key": "test-key" } : undefined,
    });

beforeAll(async () => {
    [
        { GET: leaderboardGet },
        { GET: searchGet },
        { GET: userGet },
        { GET: userStatsGet },
        { GET: userGamesGet },
    ] = await Promise.all([
        import("./games/leaderboard/route"),
        import("./users/search/route"),
        import("./users/[userId]/route"),
        import("./users/[userId]/stats/route"),
        import("./users/[userId]/games/route"),
    ]);
});

beforeEach(() => {
    for (const mockedFunction of [validateApiKeyMock, getTopPlayersMock, searchUsersMock, getUserByIdMock, getUserStatsMock, getUserLatestGamesMock, getUserGamesCountMock, getHighestStatsMock]) {
        mockedFunction.mockClear();
    }
    validateApiKeyMock.mockImplementation(async () => 123);
});

describe("API route parameter defaults", () => {
    test("uses leaderboard schema defaults when parameters are omitted", async () => {
        const response = await leaderboardGet(request("/api/games/leaderboard"));
        expect(response.status).toBe(200);
        expect(getTopPlayersMock).toHaveBeenCalledWith(GameMode.Background, "classic", 100);
    });

    test("uses the user-search limit default when it is omitted", async () => {
        const response = await searchGet(request("/api/users/search?query=player"));
        expect(response.status).toBe(200);
        expect(searchUsersMock).toHaveBeenCalledWith("player", 20);
    });

    test("uses game pagination and variant defaults when they are omitted", async () => {
        const response = await userGamesGet(request("/api/users/123/games"), { params: Promise.resolve({ userId: "123" }) });
        expect(response.status).toBe(200);
        expect(getUserLatestGamesMock).toHaveBeenCalledWith(123, undefined, "classic", 20, 0);
        expect(getUserGamesCountMock).toHaveBeenCalledWith(123, undefined, "classic");
    });

    test("allows an omitted optional user-stats mode", async () => {
        const response = await userStatsGet(request("/api/users/123/stats"), { params: Promise.resolve({ userId: "123" }) });
        expect(response.status).toBe(200);
        expect(getUserStatsMock).toHaveBeenCalledWith(123);
    });
});

describe("API route validation and authentication responses", () => {
    test("returns 400 for malformed query values", async () => {
        const response = await leaderboardGet(request("/api/games/leaderboard?limit=invalid"));
        expect(response.status).toBe(400);
        expect(getTopPlayersMock).not.toHaveBeenCalled();
    });

    test("returns 400 for non-positive or malformed user IDs", async () => {
        const zeroResponse = await userGamesGet(request("/api/users/0/games"), { params: Promise.resolve({ userId: "0" }) });
        const malformedResponse = await userGet(request("/api/users/nope"), { params: Promise.resolve({ userId: "nope" }) });
        expect(zeroResponse.status).toBe(400);
        expect(malformedResponse.status).toBe(400);
    });

    test.each([
        [new MissingApiKeyError(), 401],
        [new InvalidApiKeyError(), 403],
        [new ApiRateLimitError(), 429],
        [new ApiValidationServiceError(), 503],
    ])("maps an API key failure to its expected status", async (error, status) => {
        validateApiKeyMock.mockImplementationOnce(async () => {
            throw error;
        });
        const response = await leaderboardGet(request("/api/games/leaderboard", !(error instanceof MissingApiKeyError)));
        expect(response.status).toBe(status);
    });

    test("returns 500 for an unexpected validation failure instead of invalid-key 403", async () => {
        const consoleError = spyOn(console, "error").mockImplementation(() => {});
        validateApiKeyMock.mockImplementationOnce(async () => {
            throw new Error("unexpected dependency failure");
        });
        const response = await leaderboardGet(request("/api/games/leaderboard"));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ success: false, error: "Failed to fetch leaderboard" });
        consoleError.mockRestore();
    });
});
