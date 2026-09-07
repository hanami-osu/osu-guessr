import { Metadata } from "next";
import AboutClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "About",
    description: "Game modes, rules, scoring, and credits for osu!guessr.",
};

export default function AboutPage() {
    return <AboutClient />;
}
