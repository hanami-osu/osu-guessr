"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { BASE_POINTS, MAX_ROUNDS, ROUND_TIME, SKIP_PENALTY, STREAK_BONUS, SURVIVAL_LIVES, TIME_BONUS_MULTIPLIER } from "../games/config";
import React from "react";
import Link from "next/link";

const DevelopmentLink = () => (
    <a href="https://osu.ppy.sh/u/yorunoken" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
        yorunoken
    </a>
);

const ScoreGuesserLink = () => (
    <a href="https://guesser.lapaii.dev" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
        Lapaii{"'"}s Score Guesser
    </a>
);

const RedditThreadLink = () => (
    <a href="https://old.reddit.com/r/osugame/comments/14w0cs7/osuguesser_guess_osu_stuff/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
        reddit thread
    </a>
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-4 flex items-center gap-2 bg-muted/35 px-3 py-2.5">
        <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{children}</h2>
    </div>
);

export default function AboutClient() {
    const { t } = useTranslationsContext();

    return (
        <main className="page-container pb-6 pt-3 md:pb-8 md:pt-4">
            <div className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <header className="bg-muted/35 px-5 py-5 sm:px-7 md:px-9">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{t.about.title}</h1>
                </header>

                <div className="px-5 sm:px-7 md:px-9">
                    <section className="py-5 sm:py-6">
                        <SectionHeading>{t.about.whatIs.title}</SectionHeading>
                        <p className="text-sm leading-6 text-muted-foreground">{t.about.whatIs.description1}</p>
                    </section>

                    <section id="gameModes" className="scroll-mt-24 border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.gameModes.title}</SectionHeading>
                        <div className="grid gap-x-8 gap-y-5 md:grid-cols-3">
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">
                                    <Link href="/?game=background" scroll={false} className="underline decoration-border underline-offset-4 hover:text-primary">
                                        {t.about.gameModes.background.title}
                                    </Link>
                                </h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.about.gameModes.background.description}</p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">
                                    <Link href="/?game=audio" scroll={false} className="underline decoration-border underline-offset-4 hover:text-primary">
                                        {t.about.gameModes.audio.title}
                                    </Link>
                                </h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.about.gameModes.audio.description}</p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">
                                    <Link href="/?game=skin" scroll={false} className="underline decoration-border underline-offset-4 hover:text-primary">
                                        {t.about.gameModes.skin.title}
                                    </Link>
                                </h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.about.gameModes.skin.description}</p>
                            </div>
                        </div>
                    </section>

                    <section id="howToPlay" className="scroll-mt-24 border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.howToPlay.title}</SectionHeading>
                        <div className="space-y-3">
                            <div className="flex items-start gap-4">
                                <div className="w-5 flex-shrink-0 pt-0.5 text-sm tabular-nums text-primary">1</div>
                                <div>
                                    <h3 className="mb-1 text-sm font-semibold">{t.about.howToPlay.steps[1].title}</h3>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.howToPlay.steps[1].description}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-5 flex-shrink-0 pt-0.5 text-sm tabular-nums text-primary">2</div>
                                <div>
                                    <h3 className="mb-1 text-sm font-semibold">{t.about.howToPlay.steps[2].title}</h3>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.howToPlay.steps[2].description.replace("{seconds}", ROUND_TIME.toString())}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="w-5 flex-shrink-0 pt-0.5 text-sm tabular-nums text-primary">3</div>
                                <div>
                                    <h3 className="mb-1 text-sm font-semibold">{t.about.howToPlay.steps[3].title}</h3>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.howToPlay.steps[3].description}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section id="scoringSystem" className="scroll-mt-24 border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.scoringSystem.title}</SectionHeading>
                        <div className="space-y-2">
                            <p className="text-sm leading-6 text-muted-foreground">
                                {t.about.scoringSystem.gameInfo.length.replace("{rounds}", MAX_ROUNDS.toString()).replace("{lives}", SURVIVAL_LIVES.toString())}
                            </p>
                            <p className="text-sm leading-6 text-muted-foreground">{t.about.scoringSystem.gameInfo.time.replace("{seconds}", ROUND_TIME.toString())}</p>
                        </div>
                        <div className="mt-5 border-t border-border/60 pt-5">
                            <h3 className="mb-2 text-sm font-semibold">{t.about.howToPlay.steps[3].title}</h3>
                            <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                                <p>{t.about.scoringSystem.points.base.replace("{points}", BASE_POINTS.toString())}</p>
                                <p>{t.about.scoringSystem.points.timeBonus.replace("{multiplier}", TIME_BONUS_MULTIPLIER.toString())}</p>
                                <p>{t.about.scoringSystem.points.streakBonus.replace("{bonus}", STREAK_BONUS.toString())}</p>
                                <p>{t.about.scoringSystem.points.skipPenalty.replace("{penalty}", SKIP_PENALTY.toString())}</p>
                            </div>
                        </div>
                        <div className="mt-5 border-t border-border/60 pt-5">
                            <h3 className="mb-2 text-sm font-semibold">{t.about.scoringSystem.pp.title}</h3>
                            <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                                <p>{t.about.scoringSystem.pp.description}</p>
                                <p>{t.about.scoringSystem.pp.profile}</p>
                            </div>
                        </div>
                    </section>

                    <section className="border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.features.title}</SectionHeading>
                        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.features.leaderboards.title}</h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.leaderboard.description}</p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.features.autoComplete.title}</h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.about.features.autoComplete.description}</p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.features.profiles.title}</h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.about.features.profiles.description}</p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.features.api.title}</h3>
                                <p className="text-sm leading-6 text-muted-foreground">{t.about.features.api.description}</p>
                            </div>
                        </div>
                    </section>

                    <section className="border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.documentation.title}</SectionHeading>
                        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.documentation.api.title}</h3>
                                <p className="mb-3 text-sm leading-6 text-foreground/80">{t.about.documentation.api.description}</p>
                                <a
                                    href="https://github.com/hanami-osu/osu-guessr/blob/main/docs/API.md"
                                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {t.common.viewMore} →
                                </a>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.documentation.technical.title}</h3>
                                <p className="mb-3 text-sm leading-6 text-foreground/80">{t.about.documentation.technical.description}</p>
                                <a href="https://github.com/hanami-osu/osu-guessr#readme" className="inline-flex items-center gap-2 text-sm text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                    {t.common.viewMore} →
                                </a>
                            </div>
                        </div>
                    </section>

                    <section id="credits" className="scroll-mt-24 border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.credits.title}</SectionHeading>
                        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.credits.development.title}</h3>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    {t.about.credits.development.description.split("{author}").map((part, index, array) => (
                                        <React.Fragment key={index}>
                                            {part}
                                            {index < array.length - 1 && <DevelopmentLink />}
                                        </React.Fragment>
                                    ))}
                                </p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.credits.artwork.title}</h3>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    <a href="https://twitter.com/Akariimia" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                        {t.home.hero.artCredit}
                                    </a>
                                </p>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.credits.inspiration.title}</h3>
                                <div className="space-y-2">
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        {t.about.credits.inspiration.items.scoreGuesser.split("{link}").map((part, index, array) => (
                                            <React.Fragment key={index}>
                                                {part}
                                                {index < array.length - 1 && <ScoreGuesserLink />}
                                            </React.Fragment>
                                        ))}
                                    </p>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        {t.about.credits.inspiration.items.redditThread.split("{link}").map((part, index, array) => (
                                            <React.Fragment key={index}>
                                                {part}
                                                {index < array.length - 1 && <RedditThreadLink />}
                                            </React.Fragment>
                                        ))}
                                    </p>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.credits.specialThanks.title}</h3>
                                <div className="space-y-2">
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.credits.specialThanks.items.peppy}</p>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.credits.specialThanks.items.community}</p>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.credits.specialThanks.items.creators}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section id="contact" className="scroll-mt-24 border-t border-border/60 py-5 sm:py-6">
                        <SectionHeading>{t.about.contact.title}</SectionHeading>
                        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.contact.getInTouch.title}</h3>
                                <div className="space-y-2">
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        • GitHub:{" "}
                                        <a href="https://github.com/hanami-osu/osu-guessr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                            osu-guessr
                                        </a>
                                    </p>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        • Twitter:{" "}
                                        <a href="https://twitter.com/_yorunoken" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                            @_yorunoken
                                        </a>
                                    </p>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        • Discord: <span className="text-primary">@yorunoken</span>
                                    </p>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{t.about.contact.contribute.title}</h3>
                                <div className="space-y-2">
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.contact.contribute.items.bugs}</p>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.contact.contribute.items.code}</p>
                                    <p className="text-sm leading-6 text-muted-foreground">{t.about.contact.contribute.items.docs}</p>
                                    <a href="https://github.com/hanami-osu/osu-guessr" className="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                        {t.common.viewMore} →
                                    </a>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
