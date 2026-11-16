"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "next-auth/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Image from "next/image";
import UserSearch from "./UserSearch";
import { Heart, Info, Megaphone, Menu, Trophy, X } from "lucide-react";
import { useState } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslationsContext } from "@/context/translations-provider";
import { SupportPageLink } from "./SupportDialogWrapper";
import { usePathname } from "next/navigation";

const NAV_ITEMS = ["leaderboard", "about", "announcements"] as const;
const NAV_ICONS = { leaderboard: Trophy, about: Info, announcements: Megaphone } as const;
const MOBILE_NAV_ID = "mobile-navigation";

export default function Header() {
    const { data: session } = useSession();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { t } = useTranslationsContext();
    const pathname = usePathname();

    return (
        <header className="bg-background border-b border-border sticky top-0 z-50">
            <div className="page-container relative flex items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-6 xl:gap-8">
                    <Link href="/" className="whitespace-nowrap font-display text-xl font-bold text-primary transition-[color,opacity] duration-150 ease-smooth hover:text-primary/80 sm:text-2xl">
                        osu!guessr
                    </Link>
                    <nav className="hidden lg:block">
                        <ul className="flex items-center gap-6 xl:gap-8">
                            {NAV_ITEMS.map((item) => (
                                <li key={item}>
                                    <Link
                                        href={`/${item}`}
                                        aria-current={pathname === `/${item}` ? "page" : undefined}
                                        className={`subtle-link font-medium transition-colors duration-200 ${pathname === `/${item}` ? "text-primary" : "text-foreground/80 hover:text-primary"}`}
                                    >
                                        {t.components.header.nav[item]}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <UserSearch />
                            </li>
                        </ul>
                    </nav>
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:gap-4">
                    <LanguageSwitcher />
                    <div className="hidden lg:block">
                        <SupportPageLink />
                    </div>

                    {session?.user ? (
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 active:!transform-none" aria-label={t.components.header.accessibility.profileMenu}>
                                    <Image src={session.user?.image || "/default-avatar.svg"} alt="" className="rounded-full" fill unoptimized style={{ objectFit: "cover" }} />
                                </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-56 duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none">
                                <DropdownMenuItem className="cursor-pointer" asChild>
                                    <Link href={`/user/${session.user.banchoId}`} className="flex items-center">
                                        <div className="relative h-8 w-8 rounded-full mr-2">
                                            <Image src={session.user?.image || "/default-avatar.svg"} alt="" className="rounded-full" fill unoptimized style={{ objectFit: "cover" }} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{session.user.name}</span>
                                            <span className="text-xs text-muted-foreground">{t.components.header.nav.viewProfile}</span>
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
                                {session.user.isAdmin && (
                                    <DropdownMenuItem className="cursor-pointer" asChild>
                                        <Link href="/admin">{t.components.header.nav.admin}</Link>
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="cursor-pointer" asChild>
                                    <Link href="/settings">{t.components.header.nav.settings}</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer" onClick={() => signOut()}>
                                    {t.components.header.nav.signOut}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        pathname !== "/signin" && (
                            <Button asChild className="px-2 text-xs sm:px-4 sm:text-sm">
                                <Link href={`/signin?callbackUrl=${encodeURIComponent(pathname)}`}>{t.components.header.nav.signIn}</Link>
                            </Button>
                        )
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={isMenuOpen ? t.components.header.accessibility.closeMenu : t.components.header.accessibility.openMenu}
                        aria-expanded={isMenuOpen}
                        aria-controls={MOBILE_NAV_ID}
                    >
                        {isMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                    </Button>
                </div>

                {isMenuOpen && (
                    <>
                        <div className="fixed inset-0 -z-10 lg:hidden" aria-hidden="true" onClick={() => setIsMenuOpen(false)} />
                        <nav
                            id={MOBILE_NAV_ID}
                            aria-label={t.components.header.accessibility.mobileNavigation}
                            className="motion-scale-in absolute inset-x-4 top-full mt-2 origin-top-right overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/30 sm:left-auto sm:w-72 lg:hidden"
                        >
                            <div className="border-b border-border p-2">
                                <UserSearch className="justify-start border-transparent bg-muted/60 sm:w-full [&>kbd]:ml-auto" />
                            </div>
                            <ul className="p-2">
                                {NAV_ITEMS.map((item) => {
                                    const Icon = NAV_ICONS[item];
                                    const isCurrent = pathname === `/${item}`;
                                    return (
                                        <li key={item}>
                                            <Link
                                                href={`/${item}`}
                                                aria-current={isCurrent ? "page" : undefined}
                                                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:bg-muted ${isCurrent ? "bg-primary/10 text-primary" : "text-foreground/80 hover:text-foreground"}`}
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                <Icon className={`size-4 ${isCurrent ? "" : "text-muted-foreground"}`} aria-hidden="true" />
                                                {t.components.header.nav[item]}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="border-t border-border p-2">
                                <Link
                                    href="/support"
                                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
                                    onClick={() => setIsMenuOpen(false)}
                                >
                                    <Heart className="size-4" aria-hidden="true" />
                                    {t.common.support}
                                </Link>
                            </div>
                        </nav>
                    </>
                )}
            </div>
        </header>
    );
}
