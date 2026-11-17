import { notFound } from "next/navigation";
import { getGuestDailyResultAction } from "@/actions/game-server";
import GuestDailyResult from "./GuestDailyResult";

export const dynamic = "force-dynamic";

export default async function GuestDailyResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = await params;
    try {
        const result = await getGuestDailyResultAction(sessionId);
        return <GuestDailyResult result={result} />;
    } catch {
        notFound();
    }
}
