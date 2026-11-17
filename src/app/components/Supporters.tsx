import Image from "next/image";
import { cookies } from "next/headers";
import { getTranslations, isLocale } from "@/lib/translations";
import Link from "next/link";
import type { SupporterListEntry } from "@/actions/user-server";
import { SupportPageLink } from "@/components/SupportDialogWrapper";

export async function SupportersSection({ supporters }: { supporters: SupporterListEntry[] }) {
    const localeCookie = (await cookies()).get("locale")?.value;
    const t = getTranslations(isLocale(localeCookie) ? localeCookie : "en");

    return (
        <section className="page-container pb-12">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold tracking-tight">{t.home.supporters.title}</h2>
                <SupportPageLink />
            </div>

            {supporters.length > 0 ? (
                <ul className="flex flex-wrap gap-x-6 gap-y-3">
                    {supporters.map((supporter) => (
                        <li key={supporter.bancho_id}>
                            <Link href={`/user/${supporter.bancho_id}`} className="flex items-center gap-2.5 font-semibold transition-colors hover:text-primary">
                                <Image src={supporter.avatar_url || "/placeholder.svg"} alt="" width={28} height={28} unoptimized className="size-7 rounded-xl" />
                                {supporter.username}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="text-center text-foreground/70">
                    <p>{t.home.supporters.beFirst}</p>
                </div>
            )}
        </section>
    );
}
