import type { Metadata } from "next";
import { Public_Sans, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { SessionWrapper } from "@/context/session-wrapper";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Toaster } from "@/components/ui/toaster";
import { TranslationsProvider } from "@/context/translations-provider";
import { auth } from "@/lib/auth/auth";
import { getLockInfo } from "@/lib/infra/lockdown";
import { OWNER_ID } from "@/lib/users/owner";
import { cookies } from "next/headers";
import { env } from "@/lib/infra/env";
import { normalizePublicOrigin } from "@/lib/infra/public-url";
import { getTranslations, isLocale } from "@/lib/i18n/translations";

const publicSans = Public_Sans({
    subsets: ["latin"],
    variable: "--public-sans",
});

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--space-grotesk",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--jetbrains-mono",
});

const publicOrigin = normalizePublicOrigin(env.NEXT_PUBLIC_APP_URL);

export const metadata: Metadata = {
    metadataBase: new URL(publicOrigin),
    title: {
        default: "osu!guessr",
        template: "%s | osu!guessr",
    },
    description: "Guess osu! songs from audio clips or beatmap backgrounds, and skins from screenshots.",
    icons: {
        icon: "/favicon.png",
    },
    keywords: ["osu guessr", "osu guesser", "osu! guessr", "osu! guesser", "osu guessing game", "osu beatmap game", "osu quiz", "osu trivia"].join(", "),
    robots: {
        index: true,
        follow: true,
    },
    openGraph: {
        title: "osu!guessr",
        description: "Guess osu! songs from audio clips or beatmap backgrounds, and skins from screenshots.",
        url: publicOrigin,
        siteName: "osu!guessr",
        images: [{ url: `${publicOrigin}/main_bg.webp`, width: 1200, height: 630, alt: "osu!guessr" }],
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "osu!guessr",
        description: "Guess osu! songs from audio clips or beatmap backgrounds, and skins from screenshots.",
        images: [{ url: `${publicOrigin}/main_bg.webp`, alt: "osu!guessr" }],
    },
};

function AnalyticsScripts() {
    if (process.env.NODE_ENV !== "production") return null;

    return <Script src="https://umami.yorunoken.com/script.js" data-website-id="43244628-cb56-43d3-936e-0edbc45d4790" strategy="afterInteractive" />;
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const [lock, session, cookieStore] = await Promise.all([getLockInfo(), auth(), cookies()]);
    const localeCookie = cookieStore.get("locale")?.value;
    const hasValidLocaleCookie = isLocale(localeCookie);
    const initialLocale = hasValidLocaleCookie ? localeCookie : "en";
    const t = getTranslations(initialLocale);

    if (lock && session?.user?.banchoId !== OWNER_ID && session?.user?.banchoId !== lock.ownerId) {
        return (
            <html lang={initialLocale} suppressHydrationWarning>
                <body className={`${publicSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}>
                    <div className="flex items-center justify-center min-h-screen bg-background">
                        <div className="max-w-xl mx-auto px-4 py-8">
                            <h1 className="text-2xl font-bold mb-4">{t.lockdown.title}</h1>
                            <p className="mb-4">{t.lockdown.until.replace("{date}", new Date(lock.until).toLocaleString(initialLocale))}</p>
                            <p className="text-sm text-muted-foreground">{t.lockdown.description}</p>
                        </div>
                    </div>
                    <AnalyticsScripts />
                </body>
            </html>
        );
    }

    return (
        <html lang={initialLocale} suppressHydrationWarning>
            <head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "WebSite",
                            name: "osu!guessr",
                            url: publicOrigin,
                        }),
                    }}
                />
            </head>
            <body className={`${publicSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}>
                <TranslationsProvider initialLocale={initialLocale} migrateStoredLocale={!hasValidLocaleCookie}>
                    <SessionWrapper session={session}>
                        <div className="flex min-h-screen flex-col bg-background text-foreground">
                            <Header />
                            <main className="flex-grow">{children}</main>
                            <Footer />
                        </div>
                        <Toaster />
                    </SessionWrapper>
                </TranslationsProvider>
                <AnalyticsScripts />
            </body>
        </html>
    );
}
