"use client";

import { useTranslationsContext } from "@/context/translations-provider";
import { TIME_BONUS_MULTIPLIER, BASE_POINTS, SKIP_PENALTY, STREAK_BONUS, MAX_ROUNDS, ROUND_TIME } from "../games/config";
import React from "react";

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
        <div className="container mx-auto px-4 py-10 md:py-16 max-w-4xl">
            <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">{t.about.title}</h1>

            <div className="space-y-8">
                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.about.whatIs.title}</h2>
                    <p className="text-foreground/80 leading-relaxed mb-4">{t.about.whatIs.description1}</p>
                    <p className="text-foreground/80 leading-relaxed">{t.about.whatIs.description2}</p>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-6">{t.about.gameModes.title}</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.gameModes.background.title}</h3>
                            <p className="text-foreground/80">{t.about.gameModes.background.description}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.gameModes.audio.title}</h3>
                            <p className="text-foreground/80">{t.about.gameModes.audio.description}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.gameModes.skin.title}</h3>
                            <p className="text-foreground/80">{t.about.gameModes.skin.description}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">
                                {t.about.gameModes.more.title}
                                <span className="text-xs bg-primary/20 px-2 py-1 rounded ml-2">{t.about.gameModes.more.planned}</span>
                            </h3>
                            <p className="text-foreground/80">{t.about.gameModes.more.description}</p>
                        </div>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.about.howToPlay.title}</h2>
                    <div className="space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="bg-primary/20 text-primary rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">1</div>
                            <div>
                                <h3 className="text-lg font-medium mb-1">{t.about.howToPlay.steps[1].title}</h3>
                                <p className="text-foreground/80">{t.about.howToPlay.steps[1].description}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="bg-primary/20 text-primary rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">2</div>
                            <div>
                                <h3 className="text-lg font-medium mb-1">{t.about.howToPlay.steps[2].title}</h3>
                                <p className="text-foreground/80">{t.about.howToPlay.steps[2].description.replace("{seconds}", ROUND_TIME.toString())}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="bg-primary/20 text-primary rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">3</div>
                            <div>
                                <h3 className="text-lg font-medium mb-1">{t.about.howToPlay.steps[3].title}</h3>
                                <p className="text-foreground/80">{t.about.howToPlay.steps[3].description}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-4">{t.about.scoringSystem.title}</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="bg-background/50 p-4 rounded-lg border border-border/50">
                            <p className="text-foreground/80">{t.about.scoringSystem.points.base.replace("{points}", BASE_POINTS.toString())}</p>
                            <p className="text-foreground/80">{t.about.scoringSystem.points.timeBonus.replace("{multiplier}", TIME_BONUS_MULTIPLIER.toString())}</p>
                            <p className="text-foreground/80">{t.about.scoringSystem.points.streakBonus.replace("{bonus}", STREAK_BONUS.toString())}</p>
                        </div>
                        <div className="bg-background/50 p-4 rounded-lg border border-border/50">
                            <p className="text-foreground/80">{t.about.scoringSystem.gameInfo.length.replace("{rounds}", MAX_ROUNDS.toString())}</p>
                            <p className="text-foreground/80">{t.about.scoringSystem.gameInfo.time.replace("{seconds}", ROUND_TIME.toString())}</p>
                            <p className="text-foreground/80">{t.about.scoringSystem.points.skipPenalty.replace("{penalty}", SKIP_PENALTY.toString())}</p>
                        </div>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-6">{t.about.features.title}</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.features.leaderboards.title}</h3>
                            <p className="text-foreground/80">{t.about.features.leaderboards.description}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.features.autoComplete.title}</h3>
                            <p className="text-foreground/80">{t.about.features.autoComplete.description}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.features.profiles.title}</h3>
                            <p className="text-foreground/80">{t.about.features.profiles.description}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.features.api.title}</h3>
                            <p className="text-foreground/80">{t.about.features.api.description}</p>
                        </div>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-6">{t.about.documentation.title}</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.documentation.api.title}</h3>
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
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.documentation.technical.title}</h3>
                            <p className="text-foreground/80 mb-4">{t.about.documentation.technical.description}</p>
                            <a
                                href="https://github.com/hanami-osu/osu-guessr#readme"
                                className="text-primary hover:underline inline-flex items-center gap-2"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {t.common.viewMore} →
                            </a>
                        </div>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-6">{t.about.credits.title}</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.credits.development.title}</h3>
                            <p className="text-foreground/80">
                                {t.about.credits.development.description.split("{author}").map((part, index, array) => (
                                    <React.Fragment key={index}>
                                        {part}
                                        {index < array.length - 1 && <DevelopmentLink />}
                                    </React.Fragment>
                                ))}
                            </p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.credits.artwork.title}</h3>
                            <p className="text-foreground/80">{t.home.hero.artCredit}</p>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.credits.inspiration.title}</h3>
                            <div className="space-y-2">
                                <p className="text-foreground/80">
                                    {t.about.credits.inspiration.items.scoreGuesser.split("{link}").map((part, index, array) => (
                                        <React.Fragment key={index}>
                                            {part}
                                            {index < array.length - 1 && <ScoreGuesserLink />}
                                        </React.Fragment>
                                    ))}
                                </p>
                                <p className="text-foreground/80">
                                    {t.about.credits.inspiration.items.redditThread.split("{link}").map((part, index, array) => (
                                        <React.Fragment key={index}>
                                            {part}
                                            {index < array.length - 1 && <RedditThreadLink />}
                                        </React.Fragment>
                                    ))}
                                </p>
                            </div>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.credits.specialThanks.title}</h3>
                            <div className="space-y-2">
                                <p className="text-foreground/80">{t.about.credits.specialThanks.items.peppy}</p>
                                <p className="text-foreground/80">{t.about.credits.specialThanks.items.community}</p>
                                <p className="text-foreground/80">{t.about.credits.specialThanks.items.creators}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <h2 className="text-2xl font-semibold mb-6">{t.about.contact.title}</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.contact.getInTouch.title}</h3>
                            <div className="space-y-2">
                                <p className="text-foreground/80">
                                    • GitHub:{" "}
                                    <a href="https://github.com/hanami-osu/osu-guessr" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                        osu-guessr
                                    </a>
                                </p>
                                <p className="text-foreground/80">
                                    • Twitter:{" "}
                                    <a href="https://twitter.com/_yorunoken" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                                        @_yorunoken
                                    </a>
                                </p>
                                <p className="text-foreground/80">
                                    • Discord: <span className="text-primary">@yorunoken</span>
                                </p>
                            </div>
                        </div>
                        <div className="bg-background/50 p-5 rounded-lg border border-border/50">
                            <h3 className="text-xl font-medium mb-2 text-primary">{t.about.contact.contribute.title}</h3>
                            <p className="text-foreground/80 mb-4">{t.about.contact.contribute.description}</p>
                            <div className="space-y-2">
                                <p className="text-foreground/80">{t.about.contact.contribute.items.bugs}</p>
                                <p className="text-foreground/80">{t.about.contact.contribute.items.code}</p>
                                <p className="text-foreground/80">{t.about.contact.contribute.items.docs}</p>
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
