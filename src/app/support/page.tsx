import { ArrowUpRight, ListOrdered, Users } from "lucide-react";
import { cookies } from "next/headers";
import Image from "next/image";

import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTranslations, isLocale } from "@/lib/i18n/translations";
import { env } from "@/lib/infra/env";
import { SUPPORTER_BADGE } from "@/lib/users/supporter";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Support",
    description: "Support osu!guessr development and server costs.",
};

export default async function SupportPage() {
    const locale = (await cookies()).get("locale")?.value;
    const { support, home } = getTranslations(isLocale(locale) ? locale : "en");

    return (
        <div className="page-container py-5 sm:py-10">
            <section className="grid overflow-hidden rounded-2xl border border-primary/25 bg-[#191624] md:grid-cols-[0.92fr_1.08fr]">
                <figure className="relative isolate min-h-40 overflow-hidden border-b border-dashed border-primary/30 md:border-b-0 md:border-r">
                    <Image src="/main_bg.webp" alt="" fill priority sizes="(min-width: 1152px) 515px, (min-width: 768px) 46vw, 100vw" className="object-cover object-[30%_28%] md:object-[29%_center]" />
                    <figcaption className="absolute bottom-3 left-4 sm:left-5">
                        <a href="https://twitter.com/Akariimia" target="_blank" rel="noreferrer" className="rounded-md bg-black/75 px-2 py-1 text-xs text-white hover:underline">
                            {home.hero.artCredit}
                        </a>
                    </figcaption>
                </figure>

                <div className="px-5 py-6 sm:p-8 lg:p-10">
                    <PageHeading className="text-3xl leading-tight sm:text-4xl lg:text-5xl">{support.title}</PageHeading>
                    <p className="mt-3 max-w-[48ch] text-base leading-relaxed text-foreground/85">{support.description}</p>
                    <p className="mt-4 max-w-[55ch] text-sm leading-relaxed text-muted-foreground">{support.donate.description}</p>
                    <Button asChild size="lg" className="mt-5 h-auto min-h-11 max-w-full whitespace-normal px-5">
                        <a href={new URL("/supporter", env.HANAMI_ISSUER).href} target="_blank" rel="noopener noreferrer">
                            {support.donate.button}
                            <ArrowUpRight aria-hidden="true" className="shrink-0" />
                        </a>
                    </Button>
                </div>
            </section>

            <section className="py-7 sm:py-9" aria-labelledby="supporter-benefits">
                <h2 id="supporter-benefits" className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                    {support.benefits.title}
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    <li className="rounded-xl border border-border bg-card px-5 py-4">
                        <div className="flex min-h-7 items-center gap-2.5 text-primary">
                            <ListOrdered aria-hidden="true" className="size-5" />
                            <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary">
                                {SUPPORTER_BADGE}
                            </Badge>
                        </div>
                        <p className="mt-2 max-w-[46ch] text-sm leading-relaxed">{support.benefits.items.badge}</p>
                    </li>
                    <li className="rounded-xl border border-border bg-card px-5 py-4">
                        <div className="flex min-h-7 items-center gap-2.5 text-primary">
                            <Users aria-hidden="true" className="size-5" />
                            <span className="font-display text-sm font-semibold">{home.supporters.title}</span>
                        </div>
                        <p className="mt-2 max-w-[46ch] text-sm leading-relaxed">{support.benefits.items.homepage}</p>
                    </li>
                </ul>
                <div className="mt-4 space-y-1 text-sm leading-relaxed text-muted-foreground">
                    <p>{support.benefits.ranked}</p>
                    <p>{support.donate.reminder}</p>
                </div>
            </section>
        </div>
    );
}
