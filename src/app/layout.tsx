import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { SessionWrapper } from "@/context/session-wrapper";
import { ThemeProvider } from "@/context/theme-provider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Toaster } from "@/components/ui/toaster";
import { TranslationsProvider } from "@/context/translations-provider";
import { auth } from "@/lib/auth";
import { getLockInfo } from "@/lib/lockdown";
import { OWNER_ID } from "@/lib";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { normalizePublicOrigin } from "@/lib/public-url";
import { getTranslations, isLocale } from "@/lib/translations";

const publicSans = Public_Sans({
    subsets: ["latin"],
    variable: "--public-sans",
});

const publicOrigin = normalizePublicOrigin(env.NEXT_PUBLIC_APP_URL);

export const metadata: Metadata = {
    metadataBase: new URL(publicOrigin),
    title: {
        default: "osu!guessr",
        template: "%s | osu!guessr",
    },
    description: "Test your osu! knowledge! Guess beatmaps by audio or background.",
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
        description: "Guess osu! beatmaps from audio clips and screenshots. Free web game for osu! fans.",
        url: publicOrigin,
        siteName: "osu!guessr",
        images: [{ url: `${publicOrigin}/main_bg.webp`, width: 1200, height: 630 }],
        type: "website",
    },
};

function AnalyticsScripts() {
    if (process.env.NODE_ENV !== "production") return null;

    return (
        <>
            <Script src="https://umami.yorunoken.com/script.js" data-website-id="43244628-cb56-43d3-936e-0edbc45d4790" strategy="afterInteractive" />
            <Script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3511683752810096" crossOrigin="anonymous" strategy="afterInteractive" />
        </>
    );
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

    if (lock && session?.user?.banchoId !== OWNER_ID) {
        return (
            <html lang={initialLocale}>
                <body className={`${publicSans.variable} antialiased`}>
                    <div className="flex items-center justify-center min-h-screen bg-background">
                        <div className="max-w-xl mx-auto p-8 bg-card rounded-lg border border-border">
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
        <html lang={initialLocale}>
            <head>
                {/* JSON-LD structured data for Site */}
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
            <body className={`${publicSans.variable} antialiased`}>
                <TranslationsProvider initialLocale={initialLocale} migrateStoredLocale={!hasValidLocaleCookie}>
                    <SessionWrapper>
                        <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
                            <div className="flex min-h-screen flex-col bg-background text-foreground">
                                <Header />
                                <main className="flex-grow">{children}</main>
                                <Footer />
                            </div>
                            <Toaster />
                        </ThemeProvider>
                    </SessionWrapper>
                </TranslationsProvider>
                <AnalyticsScripts />
            </body>
        </html>
    );
}
