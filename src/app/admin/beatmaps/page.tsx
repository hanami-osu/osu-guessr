import { auth } from "@/lib/auth";
import type { Metadata } from "next";

import NotFound from "../../not-found";
import BeatmapsAdmin from "./ui";
import { listMapsets } from "../actions/mapsets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Beatmap Manager",
    robots: { index: false, follow: false },
};

export default async function BeatmapsPage() {
    const session = await auth();

    if (!session?.user?.isAdmin) {
        return <NotFound />;
    }

    const initialMapsets = await listMapsets(1, 25);
    return <BeatmapsAdmin initialMapsets={initialMapsets} />;
}
