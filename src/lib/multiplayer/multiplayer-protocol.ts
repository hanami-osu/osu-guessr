import type { GameRoundAction } from "@/lib/game/types";

export type MultiplayerRpcAction = "game.start" | "game.submit" | "game.state" | "game.end" | "game.suggestions" | "score_pp.start" | "score_pp.round" | "score_pp.state" | "score_pp.submit" | "score_pp.end";

export type MultiplayerRpcRequest = {
    type: "rpc";
    id: string;
    action: MultiplayerRpcAction;
    payload: Record<string, unknown>;
};

export type MultiplayerRpcResult = { type: "rpc_result"; id: string; result: unknown };
export type MultiplayerRpcError = { type: "rpc_error"; id: string; message: string };

// Keep the existing game.submit payload readable by browsers that were open during a deployment.
export function encodeRoundAction(action: GameRoundAction): string | null | undefined {
    return action.type === "guess" ? action.guess : { skip: null, timeout: "", advance: undefined }[action.type];
}

export function decodeRoundAction(guess: unknown): GameRoundAction {
    if (guess === undefined) return { type: "advance" };
    if (guess === null) return { type: "skip" };
    if (guess === "") return { type: "timeout" };
    if (typeof guess !== "string") throw new Error("Invalid guess");
    return { type: "guess", guess };
}

const NUMBER_TAG = "__osu_guessr_number__";

export function stringifyMultiplayerMessage(value: unknown): string {
    return JSON.stringify(value, (_key, item) => (item === Infinity ? { [NUMBER_TAG]: "Infinity" } : item));
}

export function parseMultiplayerMessage<T>(value: string): T {
    return JSON.parse(value, (_key, item) => (item && typeof item === "object" && item[NUMBER_TAG] === "Infinity" ? Infinity : item)) as T;
}
