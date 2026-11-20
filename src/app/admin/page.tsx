import { auth } from "@/lib/auth/auth";
import type { Metadata } from "next";

import NotFound from "../not-found";
import AdminMenu from "./menu";
import { toAdminSectionId } from "./section-ids";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Admin",
    robots: { index: false, follow: false },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
    const session = await auth();

    if (!session?.user?.isAdmin) {
        return <NotFound />;
    }

    const { section } = await searchParams;
    return <AdminMenu initialSection={toAdminSectionId(section)} />;
}
