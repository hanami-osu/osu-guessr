"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Image from "next/image";
import UserSearch from "./UserSearch";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslationsContext } from "@/context/translations-provider";
import { SupportPageLink } from "./SupportDialogWrapper";
import { usePathname } from "next/navigation";

const NAV_ITEMS = ["leaderboard", "about", "announcements"] as const;
const MOBILE_NAV_ID = "mobile-navigation";

export default function Header() {
    const { data: session } = useSession();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { t } = useTranslationsContext();
    const pathname = usePathname();

    return (
        <header className="bg-background/95 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
            <div className="mx-auto flex w-full max-w-[72rem] items-center justify-between gap-2 px-2 py-3 sm:px-4">
                <div className="flex min-w-0 items-center gap-6 xl:gap-8">
                    <Link href="/" className="whitespace-nowrap text-xl font-bold text-primary transition-[color,opacity] duration-150 ease-smooth hover:text-primary/80 sm:text-2xl">
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

                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={isMenuOpen ? t.components.header.accessibility.closeMenu : t.components.header.accessibility.openMenu}
                        aria-expanded={isMenuOpen}
                        aria-controls={MOBILE_NAV_ID}
                    >
                        {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                    </Button>

                    {session ? (
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
                        <Button onClick={() => signIn("hanami")} className="px-2 text-xs sm:px-4 sm:text-sm">
                            {t.components.header.nav.signIn}
                        </Button>
                    )}
                </div>

                {isMenuOpen && (
                    <nav id={MOBILE_NAV_ID} aria-label={t.components.header.accessibility.mobileNavigation} className="absolute left-0 top-full w-full border-b border-border/60 bg-background shadow-lg lg:hidden">
                        <ul className="page-container flex flex-col gap-1 py-3">
                            <li className="w-full pb-2">
                                <UserSearch />
                            </li>
                            {NAV_ITEMS.map((item) => (
                                <li className="flex w-full items-center" key={item}>
                                    <Link
                                        href={`/${item}`}
                                        aria-current={pathname === `/${item}` ? "page" : undefined}
                                        className={`w-full rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150 hover:bg-muted/60 hover:text-primary ${pathname === `/${item}` ? "bg-muted/45 text-primary" : "text-foreground/80"}`}
                                        onClick={() => setIsMenuOpen(false)}
                                    >
                                        {t.components.header.nav[item]}
                                    </Link>
                                </li>
                            ))}
                            <li className="flex w-full items-center">
                                <div className="w-full px-1 py-1" onClick={() => setIsMenuOpen(false)}>
                                    <SupportPageLink />
                                </div>
                            </li>
                        </ul>
                    </nav>
                )}
            </div>
        </header>
    );
}
