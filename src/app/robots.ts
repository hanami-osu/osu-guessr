import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { normalizePublicOrigin } from "@/lib/public-url";

export default function robots(): MetadataRoute.Robots {
    const origin = normalizePublicOrigin(env.NEXT_PUBLIC_APP_URL);

    return {
        rules: {
            userAgent: "*",
            allow: "/",
        },
        sitemap: `${origin}/sitemap.xml`,
    };
}
