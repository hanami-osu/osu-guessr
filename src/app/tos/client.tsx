"use client";

import { useTranslationsContext } from "@/context/translations-provider";

export default function TosPolicy() {
    const { t } = useTranslationsContext();

    return (
        <div className="container mx-auto px-4 py-10 md:py-16 max-w-4xl">
            <h1 className="text-3xl md:text-4xl font-bold mb-8">{t.tos.title}</h1>

            <div className="space-y-8">
                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.acceptance.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.acceptance.description}</p>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.eligibility.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.eligibility.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.tos.sections.eligibility.items.age}</li>
                            <li>{t.tos.sections.eligibility.items.account}</li>
                            <li>{t.tos.sections.eligibility.items.rules}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.content.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.content.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.tos.sections.content.items.cheating}</li>
                            <li>{t.tos.sections.content.items.abuse}</li>
                            <li>{t.tos.sections.content.items.interference}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.termination.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.termination.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.tos.sections.termination.items.violation}</li>
                            <li>{t.tos.sections.termination.items.deletion}</li>
                        </ul>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.disclaimer.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.disclaimer.description}</p>
                        <p>{t.tos.sections.disclaimer.warranty}</p>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.changes.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.changes.description}</p>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.tos.sections.contact.title}</h2>
                    <div className="space-y-4 text-foreground/80">
                        <p>{t.tos.sections.contact.description}</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>{t.tos.sections.contact.items.email}</li>
                            <li>{t.tos.sections.contact.items.discord}</li>
                            <li>
                                {t.tos.sections.contact.items.github}{" "}
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
