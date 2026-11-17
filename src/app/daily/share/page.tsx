import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import DailyScoreSummary from "@/app/scores/DailyScoreSummary";
import { createPageMetadata } from "@/lib/social-metadata";
import { getDailySharePath } from "@/lib/game/daily";
import { env } from "@/lib/env";
import { dailyShareSchema } from "./result";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
    const result = dailyShareSchema.safeParse(await searchParams);
    if (!result.success) return createPageMetadata({ title: "Daily result", description: "Play today's osu!guessr daily challenges.", path: "/?daily=true" });
    const data = result.data;
    const path = getDailySharePath(data.mode, data.day, data.points, data.time, [...data.rounds].map(code => code === "c" ? "correct" : code === "i" ? "incorrect" : code === "s" ? "skip" : "timeout"));
    const correct = [...data.rounds].filter(code => code === "c").length;
    return {
        ...createPageMetadata({ title: `daily ${data.mode.replaceAll("_", " ")} #${data.day}`, description: `${correct}/5 · ${data.points.toLocaleString("en-US")} pts · ${Math.round(data.time / 1000)}s`, path,
            image: new URL(path.replace("/daily/share?", "/daily/share/image?"), env.NEXT_PUBLIC_APP_URL).toString(), imageWidth: 1200, imageHeight: 630, largeImage: true }),
        robots: { index: false, follow: false },
    };
}

export default async function DailySharePage({ searchParams }: Props) {
    const result = dailyShareSchema.safeParse(await searchParams);
    if (!result.success) notFound();
    const data = result.data;
    return <main className="page-container py-6 md:py-10">
        <h1 className="font-display text-2xl font-semibold">osu!guessr daily {data.mode.replaceAll("_", " ")} #{data.day}</h1>
        <p className="mt-3 text-muted-foreground">{[...data.rounds].filter(code => code === "c").length}/5 · {data.points.toLocaleString("en-US")} pts · {Math.round(data.time / 1000)}s</p>
        <DailyScoreSummary gameMode={data.mode} day={data.day} points={data.points} responseTimeMs={data.time} debugUnlimitedAttempts={false}
            outcomes={[...data.rounds].map(code => ({ correct: code === "c", resultType: code === "s" ? "skip" : code === "t" ? "timeout" : "guess" }))} />
        <Button asChild><Link href="/?daily=true">Play today&apos;s daily</Link></Button>
    </main>;
}
