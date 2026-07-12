import { describe, expect, test } from "bun:test";
import { createLatestRequestGate, RequestToken } from "./latest-request";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolver, rejecter) => {
        resolve = resolver;
        reject = rejecter;
    });
    return { promise, resolve, reject };
}

describe("createLatestRequestGate", () => {
    test("prevents an older response from committing after a newer response", async () => {
        const gate = createLatestRequestGate();
        const oldResponse = deferred<string>();
        const newResponse = deferred<string>();
        const committed: string[] = [];

        const commitWhenCurrent = async (promise: Promise<string>, request: RequestToken) => {
            const value = await promise;
            if (request.isCurrent()) committed.push(value);
        };

        const oldCommit = commitWhenCurrent(oldResponse.promise, gate.begin());
        const newCommit = commitWhenCurrent(newResponse.promise, gate.begin());

        newResponse.resolve("new");
        await newCommit;
        oldResponse.resolve("old");
        await oldCommit;

        expect(committed).toEqual(["new"]);
    });

    test("invalidates an active request during cleanup", () => {
        const request = createLatestRequestGate().begin();
        request.cancel();
        expect(request.isCurrent()).toBe(false);
    });

    test("prevents a stale rejection and finalizer from changing current state", async () => {
        const gate = createLatestRequestGate();
        const oldResponse = deferred<string>();
        const oldRequest = gate.begin();
        const state = { error: "", loading: true };

        const oldCompletion = oldResponse.promise
            .catch(() => {
                if (oldRequest.isCurrent()) state.error = "old failure";
            })
            .finally(() => {
                if (oldRequest.isCurrent()) state.loading = false;
            });

        gate.begin();
        oldResponse.reject(new Error("stale"));
        await oldCompletion;

        expect(state).toEqual({ error: "", loading: true });
    });
});
