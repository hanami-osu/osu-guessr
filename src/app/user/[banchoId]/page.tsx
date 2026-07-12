import { Metadata } from "next";
import UserProfileClient from "./client";
import { parseProfileFilters } from "@/lib/profile-params";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ banchoId: string }>;
    searchParams: Promise<{ mode?: string; variant?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "User Profile",
        description: `View player statistics and achievements on osu!guessr`,
    };
}

export default async function UserProfile({ params, searchParams }: Props) {
    const { banchoId } = await params;
    const { mode, variant } = await searchParams;
    const { mode: currentMode, variant: currentVariant } = parseProfileFilters(mode, variant);

    return <UserProfileClient currentMode={currentMode} currentVariant={currentVariant} banchoId={banchoId} />;
}
