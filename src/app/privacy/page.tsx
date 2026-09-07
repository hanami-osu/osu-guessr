import { Metadata } from "next";
import PrivacyPolicy from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "How osu!guessr collects, uses, and stores your data.",
};

export default function PrivacyPolicyPage() {
    return <PrivacyPolicy />;
}
