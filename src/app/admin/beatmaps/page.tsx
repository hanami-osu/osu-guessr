import { auth } from "@/lib/auth";

import { OWNER_ID } from "@/lib";
import NotFound from "../../not-found";
import BeatmapsAdmin from "./ui";
import { listMapsets } from "../actions/mapsets";

export const dynamic = "force-dynamic";

export default async function BeatmapsPage() {
    const session = await auth();

    if (session?.user?.banchoId !== OWNER_ID) {
        return <NotFound />;
    }

    const initialMapsets = await listMapsets(1, 50);
    return <BeatmapsAdmin initialMapsets={initialMapsets} />;
}
