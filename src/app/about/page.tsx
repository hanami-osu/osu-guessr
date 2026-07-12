import { Metadata } from "next";
import AboutClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "About",
    description: "Learn more about osu!guessr, how to play, and game mechanics.",
};

export default function AboutPage() {
    return <AboutClient />;
}
