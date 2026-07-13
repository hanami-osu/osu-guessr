import { Metadata } from "next";
import TosPolicy from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "Read our terms of service and understand the rules and guidelines for using osu!guessr.",
};

export default function TosPage() {
    return <TosPolicy />;
}
