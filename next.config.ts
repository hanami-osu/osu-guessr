import type { NextConfig } from "next";

const deploymentId = process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;

const nextConfig: NextConfig = {
    output: "standalone",
    deploymentId,
    images: { remotePatterns: [{ hostname: "a.ppy.sh" }, { hostname: "assets.ppy.sh" }] },
    reactStrictMode: false,
    experimental: {
        serverActions: {
            allowedOrigins: ["guesser.yorunoken.com", "osuguessr.com", "127.0.0.1:3011"],
        },
    },
};

export default nextConfig;
