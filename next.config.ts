import type { NextConfig } from "next";

const deploymentId = process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;
const productionServerActionOrigins = ["guesser.yorunoken.com", "osuguessr.com"];
const serverActionOrigins = process.env.NODE_ENV === "production" ? productionServerActionOrigins : [...productionServerActionOrigins, "127.0.0.1:3011", "localhost:3000"];

const nextConfig: NextConfig = {
    output: "standalone",
    deploymentId,
    images: { remotePatterns: [{ hostname: "a.ppy.sh" }, { hostname: "assets.ppy.sh" }] },
    reactStrictMode: false,
    experimental: {
        serverActions: {
            allowedOrigins: serverActionOrigins,
        },
    },
};

export default nextConfig;
