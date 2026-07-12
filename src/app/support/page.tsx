import { SupportPageContent } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Support",
    description: "Support the development of osu!guessr and help keep the servers running",
};

export default function SupportPage() {
    return <SupportPageContent />;
}
