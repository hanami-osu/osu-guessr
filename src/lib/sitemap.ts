import { normalizePublicOrigin } from "./public-url";

export interface SitemapRoute {
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
    priority: number;
}

export const PUBLIC_SITEMAP_ROUTES: SitemapRoute[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/about", changeFrequency: "monthly", priority: 0.7 },
    { path: "/announcements", changeFrequency: "weekly", priority: 0.6 },
    { path: "/games/audio", changeFrequency: "weekly", priority: 0.6 },
    { path: "/games/background", changeFrequency: "weekly", priority: 0.8 },
    { path: "/games/skin", changeFrequency: "weekly", priority: 0.6 },
    { path: "/leaderboard", changeFrequency: "daily", priority: 0.7 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/support", changeFrequency: "monthly", priority: 0.4 },
    { path: "/tos", changeFrequency: "yearly", priority: 0.2 },
];

export function escapeSitemapXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildSitemapXml(origin: string, routes: SitemapRoute[] = PUBLIC_SITEMAP_ROUTES): string {
    const publicOrigin = normalizePublicOrigin(origin);
    const uniqueRoutes = [...new Map(routes.map((route) => [route.path, route])).values()];
    const entries = uniqueRoutes.map((route) => {
        const location = escapeSitemapXml(new URL(route.path, `${publicOrigin}/`).toString());
        return `  <url>\n    <loc>${location}</loc>\n    <changefreq>${route.changeFrequency}</changefreq>\n    <priority>${route.priority.toFixed(1)}</priority>\n  </url>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;
}
