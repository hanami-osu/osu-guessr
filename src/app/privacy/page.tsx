import { Metadata } from "next";
import PrivacyPolicy from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "Learn about how we handle your data and privacy on osu!guessr.",
};

export default function PrivacyPolicyPage() {
    return <PrivacyPolicy />;
}
