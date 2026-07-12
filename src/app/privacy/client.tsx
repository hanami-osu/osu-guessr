"use client";

import { useTranslationsContext } from "@/context/translations-provider";

export default function PrivacyPolicy() {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto px-4 py-10 md:py-16 max-w-4xl">
            <h1 className="text-3xl md:text-4xl font-bold mb-8">{t.privacy.title}</h1>

            <div className="space-y-8">
                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.dataCollection.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.dataCollection.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.privacy.sections.dataCollection.items.profile}</li>
                            <li>{t.privacy.sections.dataCollection.items.stats}</li>
                            <li>{t.privacy.sections.dataCollection.items.session}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.dataUsage.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.dataUsage.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.privacy.sections.dataUsage.items.progress}</li>
                            <li>{t.privacy.sections.dataUsage.items.leaderboards}</li>
                            <li>{t.privacy.sections.dataUsage.items.improvement}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.dataProtection.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.dataProtection.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.privacy.sections.dataProtection.items.encryption}</li>
                            <li>{t.privacy.sections.dataProtection.items.updates}</li>
                            <li>{t.privacy.sections.dataProtection.items.access}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.thirdParty.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.thirdParty.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.privacy.sections.thirdParty.items.osu}</li>
                            <li>{t.privacy.sections.thirdParty.items.analytics}</li>
                            <li>{t.privacy.sections.thirdParty.items.cdn}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.dataRetention.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.dataRetention.description}</p>
                        <p>{t.privacy.sections.dataRetention.gameStats}</p>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.rights.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.rights.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.privacy.sections.rights.items.access}</li>
                            <li>{t.privacy.sections.rights.items.correction}</li>
                            <li>{t.privacy.sections.rights.items.objection}</li>
                            <li>{t.privacy.sections.rights.items.export}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.privacy.sections.contact.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.privacy.sections.contact.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.privacy.sections.contact.items.email}</li>
                            <li>{t.privacy.sections.contact.items.discord}</li>
                            <li>
                                {t.privacy.sections.contact.items.github}{" "}
                                <a href="https://github.com/hanami-osu/osu-guessr" className="text-primary hover:underline">
                                    osu-guessr
                                </a>
                            </li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
}
