"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useTranslationsContext } from "@/context/translations-provider";

export default function SignInPrompt({ redirectTo, required = true }: { redirectTo?: string; required?: boolean }) {
    const { t } = useTranslationsContext();

    return (
        <div className="page-container py-16 sm:py-24">
            <div className="motion-fade-up mx-auto w-full max-w-md">
                <div className="overflow-hidden rounded-lg border border-border bg-card/60">
                    <div className="p-6 sm:p-8">
                        <div className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <LogIn className="size-5" aria-hidden="true" />
                        </div>

                        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{required ? t.errors.auth.required.title : t.components.header.nav.signIn}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.errors.auth.required.description}</p>

                        <Button size="lg" onClick={() => signIn("hanami", { redirectTo })} className="mt-6 w-full">
                            {t.home.hero.signIn}
                        </Button>

                        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                            {t.errors.auth.required.notice}{" "}
                            <a href="https://hanami.yorunoken.com/legal/terms" target="_blank" rel="noopener noreferrer" className="text-foreground/80 underline underline-offset-2 hover:text-foreground">
                                {t.components.footer.tos}
                            </a>
                            {" · "}
                            <a href="https://hanami.yorunoken.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground/80 underline underline-offset-2 hover:text-foreground">
                                {t.components.footer.privacy}
                            </a>
                        </p>
                    </div>

                    <div className="border-t border-border bg-muted/30 px-6 py-4 text-sm sm:px-8">
                        <a href="https://osu.ppy.sh/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {t.errors.auth.required.noAccount}
                        </a>
                    </div>
                </div>

                <Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {t.user.notFound.actions.home}
                </Link>
            </div>
        </div>
    );
}
