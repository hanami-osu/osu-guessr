"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Image from "next/image";
import UserSearch from "./UserSearch";
import { Menu } from "lucide-react";
import { useState } from "react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslationsContext } from "@/context/translations-provider";
import { SupportPageLink } from "./SupportDialogWrapper";
import { OWNER_ID } from "@/lib";

const NAV_ITEMS = ["leaderboard", "about", "announcements"] as const;
const MOBILE_NAV_ID = "mobile-navigation";

export default function Header() {
    const { data: session } = useSession();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { t } = useTranslationsContext();

    const getNavLabel = (key: string) => {
        try {
            const val = (t.components.header.nav as Record<string, string>)[key];
            if (val) return val;
        } catch {
            /* noop */
        }
        return key.charAt(0).toUpperCase() + key.slice(1);
    };

    return (
        <header className="bg-background/95 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
            <div className="container mx-auto flex items-center justify-between gap-2 px-2 py-3 sm:px-4">
                <div className="flex min-w-0 items-center space-x-8">
                    <Link href="/" className="whitespace-nowrap text-xl font-bold text-primary transition-[color,opacity] duration-150 ease-[var(--ease-out-smooth)] hover:text-primary/80 sm:text-2xl">
                        osu!guessr
                    </Link>
                    <nav className="hidden md:block">
                        <ul className="flex space-x-8 items-center">
                            {NAV_ITEMS.map((item) => (
                                <li key={item}>
                                    <Link href={`/${item}`} className="subtle-link text-foreground/80 hover:text-primary transition-colors duration-200 font-medium">
                                        {getNavLabel(item)}
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
                    <div className="hidden md:block">
                        <SupportPageLink />
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label={isMenuOpen ? t.components.header.accessibility.closeMenu : t.components.header.accessibility.openMenu}
                        aria-expanded={isMenuOpen}
                        aria-controls={MOBILE_NAV_ID}
                    >
                        <Menu className="h-6 w-6" />
                    </Button>

                    {session ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 active:!transform-none" aria-label={t.components.header.accessibility.profileMenu}>
                                    <Image src={session.user?.image || "/default-avatar.png"} alt="Avatar" className="rounded-full" fill style={{ objectFit: "cover" }} />
                                </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-56 duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none">
                                <DropdownMenuItem className="cursor-pointer" asChild>
                                    <Link href={`/user/${session.user.banchoId}`} className="flex items-center">
                                        <div className="relative h-8 w-8 rounded-full mr-2">
                                            <Image src={session.user?.image || "/default-avatar.png"} alt="Avatar" className="rounded-full" fill style={{ objectFit: "cover" }} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{session.user.name}</span>
                                            <span className="text-xs text-muted-foreground">{t.components.header.nav.viewProfile}</span>
                                        </div>
                                    </Link>
                                </DropdownMenuItem>
                                {session.user.banchoId === OWNER_ID && (
                                    <DropdownMenuItem className="cursor-pointer" asChild>
                                        <Link href="/admin">Admin</Link>
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
                        <Button onClick={() => signIn("osu")} className="px-2 text-xs sm:px-4 sm:text-sm">
                            {t.components.header.nav.signIn}
                        </Button>
                    )}
                </div>

                {isMenuOpen && (
                    <nav id={MOBILE_NAV_ID} aria-label={t.components.header.accessibility.mobileNavigation} className="absolute left-0 top-full w-full bg-background shadow-md md:hidden">
                        <ul className="flex flex-col items-center space-y-4 py-4">
                            <li className="w-full px-4">
                                <UserSearch />
                            </li>
                            {NAV_ITEMS.map((item) => (
                                <li className="flex w-full items-center" key={item}>
                                    <Link
                                        href={`/${item}`}
                                        className="w-full px-4 py-2 text-center font-medium text-foreground/80 transition-colors duration-200 hover:text-primary"
                                        onClick={() => setIsMenuOpen(false)}
                                    >
                                        {getNavLabel(item)}
                                    </Link>
                                </li>
                            ))}
                            <li className="flex w-full items-center">
                                <div className="w-full px-4 py-2 text-center" onClick={() => setIsMenuOpen(false)}>
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
