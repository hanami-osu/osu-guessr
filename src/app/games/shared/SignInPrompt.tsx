"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useTranslationsContext } from "@/context/translations-provider";
import type { InteractiveAuthProvider } from "@/lib/auth-provider";

export default function SignInPrompt({ authProvider }: { authProvider: InteractiveAuthProvider }) {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto px-4 py-16">
            <div className="max-w-2xl mx-auto text-center">
                <div className="bg-card rounded-xl p-8 border border-border/50">
                    <h1 className="text-3xl font-bold mb-6">{authProvider === "hanami" ? "Hanami account required" : t.errors.auth.required.title}</h1>

                    <div className="space-y-4 mb-8">
                        <p className="text-foreground/70">
                            {authProvider === "hanami" ? "Continue with an active Hanami account to play osu!guessr." : t.errors.auth.required.description}
                        </p>
                        <p className="text-foreground/70">{t.errors.auth.required.subDescription}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button onClick={() => signIn(authProvider)} className="w-full sm:w-auto">
                            {authProvider === "hanami" ? "Continue with Hanami" : t.home.hero.signIn}
                        </Button>
                        <Link href="/">
                            <Button variant="outline" className="w-full sm:w-auto">
                                {t.user.notFound.actions.home}
                            </Button>
                        </Link>
                    </div>

                    {authProvider === "osu" && (
                        <div className="mt-8 pt-6 border-t border-border/50">
                            <p className="text-sm text-foreground/50">
                                <a href="https://osu.ppy.sh/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {t.errors.auth.required.noAccount}
                                </a>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
