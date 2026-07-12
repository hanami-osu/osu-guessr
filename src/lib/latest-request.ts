export interface RequestToken {
    isCurrent(): boolean;
    cancel(): void;
}

export function createLatestRequestGate() {
    let activeRequest = 0;

    return {
        begin(): RequestToken {
            const requestId = ++activeRequest;

            return {
                isCurrent: () => requestId === activeRequest,
                cancel: () => {
                    if (requestId === activeRequest) {
                        activeRequest += 1;
                    }
                },
            };
        },
    };
}
