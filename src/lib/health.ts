export type DependencyHealth = "ok" | "unavailable";

interface HealthDependencies {
    redisPing(): Promise<unknown>;
    mariaDbPing(): Promise<unknown>;
}

export interface HealthPayload {
    ok: boolean;
    deploymentId: string | null;
    dependencies: {
        redis: DependencyHealth;
        mariadb: DependencyHealth;
    };
}

async function checkWithTimeout(check: () => Promise<unknown>, timeoutMs: number): Promise<DependencyHealth> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (status: DependencyHealth) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(status);
        };
        const timer = setTimeout(() => finish("unavailable"), timeoutMs);

        Promise.resolve()
            .then(check)
            .then(() => finish("ok"))
            .catch(() => finish("unavailable"));
    });
}

export async function getApplicationHealth(dependencies: HealthDependencies, deploymentId: string | undefined, timeoutMs: number = 2000): Promise<{ status: 200 | 503; body: HealthPayload }> {
    const [redis, mariadb] = await Promise.all([checkWithTimeout(dependencies.redisPing, timeoutMs), checkWithTimeout(dependencies.mariaDbPing, timeoutMs)]);
    const ok = redis === "ok" && mariadb === "ok";

    return {
        status: ok ? 200 : 503,
        body: {
            ok,
            deploymentId: deploymentId || null,
            dependencies: { redis, mariadb },
        },
    };
}
