import { SupportPageContent } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Support",
    description: "Support osu!guessr development and server costs.",
};

export default function SupportPage() {
    return <SupportPageContent />;
}
