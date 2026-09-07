import { Metadata } from "next";
import TosPolicy from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "Terms for using osu!guessr.",
};

export default function TosPage() {
    return <TosPolicy />;
}
