export type MultiplayerRpcAction = "game.start" | "game.submit" | "game.state" | "game.end" | "game.suggestions" | "score_pp.start" | "score_pp.round" | "score_pp.state" | "score_pp.submit" | "score_pp.end";

export type MultiplayerRpcRequest = {
    type: "rpc";
    id: string;
    action: MultiplayerRpcAction;
    payload: Record<string, unknown>;
};

export type MultiplayerRpcResult = { type: "rpc_result"; id: string; result: unknown };
export type MultiplayerRpcError = { type: "rpc_error"; id: string; message: string };

const NUMBER_TAG = "__osu_guessr_number__";

export function stringifyMultiplayerMessage(value: unknown): string {
    return JSON.stringify(value, (_key, item) => (item === Infinity ? { [NUMBER_TAG]: "Infinity" } : item));
}

export function parseMultiplayerMessage<T>(value: string): T {
    return JSON.parse(value, (_key, item) => (item && typeof item === "object" && item[NUMBER_TAG] === "Infinity" ? Infinity : item)) as T;
}
