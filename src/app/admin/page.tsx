import { auth } from "@/lib/auth";
import type { Metadata } from "next";

import { OWNER_ID } from "@/lib";
import NotFound from "../not-found";
import AdminMenu from "./menu";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Admin",
    robots: { index: false, follow: false },
};

export default async function AdminPage() {
    const session = await auth();

    if (session?.user?.banchoId !== OWNER_ID) {
        return <NotFound />;
    }

    return <AdminMenu />;
}
