export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { startScorePpPairPoolMaintainer } = await import("@/lib/score-pp/pool");
    startScorePpPairPoolMaintainer();
}
