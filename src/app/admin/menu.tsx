"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, BarChart3, CalendarDays, Disc3, Flag, Languages, Megaphone, Paintbrush, ShieldCheck, Wrench } from "lucide-react";
import MapsetsSection from "./sections/MapsetsSection";
import SkinsSection from "./sections/SkinsSection";
import DailySection from "./sections/DailySection";
import AnnouncementsSection from "./sections/AnnouncementsSection";
import ReportsSection from "./sections/ReportsSection";
import BadgesSection from "./sections/BadgesSection";
import AdminsSection from "./sections/AdminsSection";
import TranslationsSection from "./sections/TranslationsSection";
import MaintenanceSection from "./sections/MaintenanceSection";
import type { AdminSectionId } from "./section-ids";

const ADMIN_SECTIONS: Array<{ id: AdminSectionId; label: string; icon: typeof Disc3; Component: () => React.JSX.Element }> = [
    { id: "mapsets", label: "Mapsets", icon: Disc3, Component: MapsetsSection },
    { id: "skins", label: "Skins", icon: Paintbrush, Component: SkinsSection },
    { id: "daily", label: "Daily challenge", icon: CalendarDays, Component: DailySection },
    { id: "announcements", label: "Announcements", icon: Megaphone, Component: AnnouncementsSection },
    { id: "reports", label: "Reports", icon: Flag, Component: ReportsSection },
    { id: "badges", label: "Badges", icon: BadgeCheck, Component: BadgesSection },
    { id: "admins", label: "Admins", icon: ShieldCheck, Component: AdminsSection },
    { id: "translations", label: "Translations", icon: Languages, Component: TranslationsSection },
    { id: "maintenance", label: "Maintenance", icon: Wrench, Component: MaintenanceSection },
];

const navItemClass = "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

export default function AdminMenu({ initialSection }: { initialSection: AdminSectionId }) {
    const [sectionId, setSectionId] = useState<AdminSectionId>(initialSection);
    const { Component } = ADMIN_SECTIONS.find(({ id }) => id === sectionId) ?? ADMIN_SECTIONS[0];
    const activeNavItem = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        activeNavItem.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [sectionId]);

    const openSection = (id: AdminSectionId) => {
        setSectionId(id);
        window.history.replaceState(null, "", `?section=${id}`);
    };

    return (
        <div className="page-container py-6 md:py-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Administration</h1>

            <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
                <nav aria-label="Admin sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border/60 px-4 pb-3 scrollbar-thin lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:border-b-0 lg:px-0 lg:pb-0">
                    {ADMIN_SECTIONS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            ref={id === sectionId ? activeNavItem : undefined}
                            type="button"
                            onClick={() => openSection(id)}
                            aria-current={id === sectionId ? "page" : undefined}
                            className={`${navItemClass} text-left ${id === sectionId ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            {label}
                        </button>
                    ))}
                    <div className="mx-1 shrink-0 border-l border-border/60 lg:mx-0 lg:my-2 lg:border-l-0 lg:border-t" aria-hidden="true" />
                    <Link href="/admin/analytics" className={`${navItemClass} text-muted-foreground hover:bg-muted hover:text-foreground`}>
                        <BarChart3 className="size-4 shrink-0" aria-hidden="true" />
                        Analytics
                        <ArrowUpRight className="ml-auto size-3.5" aria-hidden="true" />
                    </Link>
                    <Link href="/admin/beatmaps" className={`${navItemClass} text-muted-foreground hover:bg-muted hover:text-foreground`}>
                        <Disc3 className="size-4 shrink-0" aria-hidden="true" />
                        Beatmap browser
                        <ArrowUpRight className="ml-auto size-3.5" aria-hidden="true" />
                    </Link>
                </nav>

                <div className="min-w-0">
                    <Component key={sectionId} />
                </div>
            </div>
        </div>
    );
}
