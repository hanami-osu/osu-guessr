import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { dailyShareSchema } from "../result";

export function GET(request: NextRequest) {
    const parsed = dailyShareSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return new Response("Invalid daily result", { status: 400 });
    const data = parsed.data;
    const correct = [...data.rounds].filter(code => code === "c").length;
    return new ImageResponse(
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", padding: 80, background: "#17171c", color: "#f5f5f5", fontFamily: "sans-serif" }}>
            <div style={{ display: "flex", fontSize: 32, color: "#ff69b4" }}>osu!guessr</div>
            <div style={{ display: "flex", fontSize: 52, marginTop: 24 }}>daily {data.mode.replaceAll("_", " ")} #{data.day}</div>
            <div style={{ display: "flex", gap: 20, marginTop: 48 }}>{[...data.rounds].map((code, index) => <div key={index} style={{ width: 64, height: 64, borderRadius: 32, background: code === "c" ? "#10b981" : code === "i" ? "#ef4444" : code === "s" ? "#f97316" : "#555560" }} />)}</div>
            <div style={{ display: "flex", fontSize: 38, marginTop: 48 }}>{correct}/5 · {data.points.toLocaleString("en-US")} pts · {Math.round(data.time / 1000)}s</div>
        </div>, { width: 1200, height: 630 },
    );
}
