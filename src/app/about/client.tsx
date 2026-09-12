"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { MAX_ROUNDS, ROUND_TIME } from "../games/config";
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

export default function AboutClient() {
    const { t } = useTranslationsContext();

    return (
        <div className="page-container py-10 md:py-16">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">{t.about.title}</h1>
            <div className="space-y-10">
                <section>
                    <h2 className="text-xl font-semibold tracking-tight mb-4">{t.about.whatIs.title}</h2>
                    <p className="text-muted-foreground leading-7">{t.about.whatIs.description1}</p>
                </section>

                <section id="gameModes" className="scroll-mt-24 border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-6">{t.about.gameModes.title}</h2>
                    <div className="grid gap-x-10 gap-y-6 md:grid-cols-3">
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">
                                <Link href="/?game=background" scroll={false} className="underline decoration-border underline-offset-4 hover:text-primary">
                                    {t.about.gameModes.background.title}
                                </Link>
                            </h3>
                            <p className="text-muted-foreground leading-7">{t.about.gameModes.background.description}</p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">
                                <Link href="/?game=audio" scroll={false} className="underline decoration-border underline-offset-4 hover:text-primary">
                                    {t.about.gameModes.audio.title}
                                </Link>
                            </h3>
                            <p className="text-muted-foreground leading-7">{t.about.gameModes.audio.description}</p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">
                                <Link href="/?game=skin" scroll={false} className="underline decoration-border underline-offset-4 hover:text-primary">
                                    {t.about.gameModes.skin.title}
                                </Link>
                            </h3>
                            <p className="text-muted-foreground leading-7">{t.about.gameModes.skin.description}</p>
                        </div>
                    </div>
                </section>

                <section id="howToPlay" className="scroll-mt-24 border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-4">{t.about.howToPlay.title}</h2>
                    <div className="space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="text-muted-foreground tabular-nums w-5 flex-shrink-0 pt-0.5">1</div>
                            <div>
                                <h3 className="text-lg font-medium mb-1">{t.about.howToPlay.steps[1].title}</h3>
                                <p className="text-muted-foreground leading-7">{t.about.howToPlay.steps[1].description}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="text-muted-foreground tabular-nums w-5 flex-shrink-0 pt-0.5">2</div>
                            <div>
                                <h3 className="text-lg font-medium mb-1">{t.about.howToPlay.steps[2].title}</h3>
                                <p className="text-muted-foreground leading-7">{t.about.howToPlay.steps[2].description.replace("{seconds}", ROUND_TIME.toString())}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="text-muted-foreground tabular-nums w-5 flex-shrink-0 pt-0.5">3</div>
                            <div>
                                <h3 className="text-lg font-medium mb-1">{t.about.scoringSystem.pp.title}</h3>
                                <p className="text-muted-foreground leading-7">{t.about.scoringSystem.pp.description}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="scoringSystem" className="scroll-mt-24 border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-4">{t.about.scoringSystem.title}</h2>
                    <div className="space-y-2">
                        <p className="text-muted-foreground leading-7">{t.about.scoringSystem.gameInfo.length.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                        <p className="text-muted-foreground leading-7">{t.about.scoringSystem.gameInfo.time.replace("{seconds}", ROUND_TIME.toString())}</p>
                    </div>
                    <div className="mt-5 border-t border-border/60 pt-5">
                        <h3 className="mb-2 text-lg font-medium">{t.about.scoringSystem.pp.title}</h3>
                        <div className="space-y-2 text-muted-foreground leading-7">
                            <p>{t.about.scoringSystem.pp.description}</p>
                            <p>{t.about.scoringSystem.pp.profile}</p>
                        </div>
                    </div>
                </section>

                <section className="border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-6">{t.about.features.title}</h2>
                    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.features.leaderboards.title}</h3>
                            <p className="text-muted-foreground leading-7">{t.leaderboard.description}</p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.features.autoComplete.title}</h3>
                            <p className="text-muted-foreground leading-7">{t.about.features.autoComplete.description}</p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.features.profiles.title}</h3>
                            <p className="text-muted-foreground leading-7">{t.about.features.profiles.description}</p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.features.api.title}</h3>
                            <p className="text-muted-foreground leading-7">{t.about.features.api.description}</p>
                        </div>
                    </div>
                </section>

                <section className="border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-6">{t.about.documentation.title}</h2>
                    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.documentation.api.title}</h3>
                            <p className="text-foreground/80 mb-4">{t.about.documentation.api.description}</p>
                            <a
                                href="https://github.com/hanami-osu/osu-guessr/blob/main/docs/API.md"
                                className="text-primary hover:underline inline-flex items-center gap-2"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {t.common.viewMore} →
                            </a>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.documentation.technical.title}</h3>
                            <p className="text-foreground/80 mb-4">{t.about.documentation.technical.description}</p>
                            <a href="https://github.com/hanami-osu/osu-guessr#readme" className="text-primary hover:underline inline-flex items-center gap-2" target="_blank" rel="noopener noreferrer">
                                {t.common.viewMore} →
                            </a>
                        </div>
                    </div>
                </section>

                <section id="credits" className="scroll-mt-24 border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-6">{t.about.credits.title}</h2>
                    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.credits.development.title}</h3>
                            <p className="text-muted-foreground leading-7">
                                {t.about.credits.development.description.split("{author}").map((part, index, array) => (
                                    <React.Fragment key={index}>
                                        {part}
                                        {index < array.length - 1 && <DevelopmentLink />}
                                    </React.Fragment>
                                ))}
                            </p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.credits.artwork.title}</h3>
                            <p className="text-muted-foreground leading-7">
                                <a href="https://twitter.com/Akariimia" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                    {t.home.hero.artCredit}
                                </a>
                            </p>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.credits.inspiration.title}</h3>
                            <div className="space-y-2">
                                <p className="text-muted-foreground leading-7">
                                    {t.about.credits.inspiration.items.scoreGuesser.split("{link}").map((part, index, array) => (
                                        <React.Fragment key={index}>
                                            {part}
                                            {index < array.length - 1 && <ScoreGuesserLink />}
                                        </React.Fragment>
                                    ))}
                                </p>
                                <p className="text-muted-foreground leading-7">
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
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.credits.specialThanks.title}</h3>
                            <div className="space-y-2">
                                <p className="text-muted-foreground leading-7">{t.about.credits.specialThanks.items.peppy}</p>
                                <p className="text-muted-foreground leading-7">{t.about.credits.specialThanks.items.community}</p>
                                <p className="text-muted-foreground leading-7">{t.about.credits.specialThanks.items.creators}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="contact" className="scroll-mt-24 border-t border-border/60 pt-8">
                    <h2 className="text-xl font-semibold tracking-tight mb-6">{t.about.contact.title}</h2>
                    <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.contact.getInTouch.title}</h3>
                            <div className="space-y-2">
                                <p className="text-muted-foreground leading-7">
                                    • GitHub:{" "}
                                    <a href="https://github.com/hanami-osu/osu-guessr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                        osu-guessr
                                    </a>
                                </p>
                                <p className="text-muted-foreground leading-7">
                                    • Twitter:{" "}
                                    <a href="https://twitter.com/_yorunoken" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                        @_yorunoken
                                    </a>
                                </p>
                                <p className="text-muted-foreground leading-7">
                                    • Discord: <span className="text-primary">@yorunoken</span>
                                </p>
                            </div>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-semibold mb-2 text-foreground">{t.about.contact.contribute.title}</h3>
                            <div className="space-y-2">
                                <p className="text-muted-foreground leading-7">{t.about.contact.contribute.items.bugs}</p>
                                <p className="text-muted-foreground leading-7">{t.about.contact.contribute.items.code}</p>
                                <p className="text-muted-foreground leading-7">{t.about.contact.contribute.items.docs}</p>
                                <a href="https://github.com/hanami-osu/osu-guessr" className="text-primary hover:underline inline-flex items-center gap-2 mt-2" target="_blank" rel="noopener noreferrer">
                                    {t.common.viewMore} →
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
