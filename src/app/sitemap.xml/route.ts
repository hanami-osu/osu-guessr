import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildSitemapXml } from "@/lib/sitemap";

export async function GET() {
    return new NextResponse(buildSitemapXml(env.NEXT_PUBLIC_APP_URL), {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=0, s-maxage=3600",
        },
    });
}
