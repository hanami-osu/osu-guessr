import Link from "next/link";

import { GAME_MODES, PROGRESSION_LABELS, RETENTION_DAYS, type Analytics, type ItemStat, type WrongGuess } from "@/lib/analytics/queries";

import { ColumnChart, Heatmap, LineChart, SegmentedBar, type Series } from "./charts";
import { END_REASON_COLORS, EXTRA_SERIES, formatValue, MODE_COLORS, MODE_LABELS, NEUTRAL_SERIES, OUTCOME_COLORS, titleCase } from "./format";
import { DataTable, Note, Panel, Section, StatTile, Swatch, type Column } from "./ui";

const MODE_SERIES: Series[] = GAME_MODES.map((mode) => ({ key: mode, label: MODE_LABELS[mode], color: MODE_COLORS[mode] }));
const OUTCOME_SERIES = {
    accuracy: { key: "accuracy", label: "Correct", color: OUTCOME_COLORS.correct },
    skipRate: { key: "skipRate", label: "Skipped", color: OUTCOME_COLORS.skipped },
    timeoutRate: { key: "timeoutRate", label: "Timed out", color: OUTCOME_COLORS.timedOut },
} satisfies Record<string, Series>;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const QUICK_SKIP_MS = 3000;

function ModeLabel({ mode }: { mode: string }) {
    return <Swatch color={MODE_COLORS[mode] ?? NEUTRAL_SERIES} label={MODE_LABELS[mode] ?? mode} />;
}

function ItemLink({ item }: { item: Pick<ItemStat, "itemType" | "itemId" | "answer"> }) {
    if (item.itemType !== "mapset") return <span>{item.answer}</span>;
    return (
        <a href={`https://osu.ppy.sh/beatmapsets/${item.itemId}`} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
            {item.answer}
        </a>
    );
}

function shortDate(key: string): string {
    return new Date(`${key}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function OverviewSection({ data }: { data: Analytics }) {
    const { kpis, previousKpis, timeline, modeVariants, heatmap, runTypes, versions } = data.overview;
    const categories = timeline.map((point) => shortDate(point.bucket));
    const heat = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
    for (const cell of heatmap) heat[cell.weekday][cell.hour] = cell.games;
    const bucketWord = data.range.bucket === "week" ? "Week of" : "Day";

    return (
        <Section id="overview" title="Overview" description="Changes are relative to the previous period of the same length.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2 xl:grid-cols-7">
                <StatTile label="Games" value={kpis.games} previous={previousKpis?.games} format="count" />
                <StatTile label="Players" value={kpis.players} previous={previousKpis?.players} format="count" />
                <StatTile label="New users" value={kpis.newUsers} previous={previousKpis?.newUsers} format="count" />
                <StatTile label="Rounds tracked" value={kpis.rounds} previous={previousKpis?.rounds} format="count" />
                <StatTile label="Accuracy" value={kpis.accuracy} previous={previousKpis?.accuracy} format="percent" />
                <StatTile label="Avg game length" value={kpis.avgDurationSeconds} previous={previousKpis?.avgDurationSeconds} format="duration" />
                <StatTile label="Quit rate" value={kpis.quitRate} previous={previousKpis?.quitRate} format="percent" upIsGood={false} />
            </div>

            <Panel title="Games by mode" description={`Finished games per ${data.range.bucket}, stacked by mode.`} wide>
                <ColumnChart
                    label="Games by mode over time"
                    categories={categories}
                    series={MODE_SERIES}
                    values={GAME_MODES.map((mode) => timeline.map((point) => point.games[mode]))}
                    categoryHeader={bucketWord}
                    height={240}
                />
            </Panel>

            <Panel title="Active players and signups" description={`Distinct players who finished a game, and new accounts, per ${data.range.bucket}.`}>
                <LineChart
                    label="Active players and signups over time"
                    categories={categories}
                    series={[
                        { key: "players", label: "Active players", color: EXTRA_SERIES[0] },
                        { key: "signups", label: "Signups", color: EXTRA_SERIES[1] },
                    ]}
                    values={[timeline.map((point) => point.players), timeline.map((point) => point.signups)]}
                    format="count"
                    categoryHeader={bucketWord}
                />
            </Panel>

            <Panel title="When people play" description="Finished games by weekday and hour.">
                <Heatmap label="Games by weekday and hour (UTC)" rows={WEEKDAYS} columns={Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))} values={heat} />
            </Panel>

            <Panel title="Modes and variants" description="“Exhausted” means the game ran out of items." wide>
                <DataTable
                    rows={modeVariants}
                    columns={[
                        { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
                        { header: "Variant", cell: (row) => titleCase(row.variant) },
                        { header: "Games", numeric: true, cell: (row) => formatValue(row.games, "count") },
                        { header: "Players", numeric: true, cell: (row) => formatValue(row.players, "count") },
                        { header: "Avg rounds", numeric: true, cell: (row) => (row.avgRounds === null ? "–" : row.avgRounds.toFixed(1)) },
                        { header: "Accuracy", numeric: true, cell: (row) => formatValue(row.accuracy, "percent") },
                        { header: "Skips", numeric: true, cell: (row) => formatValue(row.skipRate, "percent") },
                        { header: "Timeouts", numeric: true, cell: (row) => formatValue(row.timeoutRate, "percent") },
                        { header: "Avg streak", numeric: true, cell: (row) => row.avgStreak.toFixed(1) },
                        { header: "Best", numeric: true, cell: (row) => formatValue(row.maxStreak, "count") },
                        { header: "Avg pp", numeric: true, cell: (row) => formatValue(row.avgPp, "decimal") },
                        { header: "Quit", numeric: true, cell: (row) => formatValue(row.quitRate, "percent") },
                        { header: "Failed", numeric: true, cell: (row) => formatValue(row.failRate, "percent") },
                        { header: "Exhausted", numeric: true, cell: (row) => formatValue(row.exhaustedRate, "percent") },
                    ]}
                />
            </Panel>

            <Panel title="Run types" description="Standard, daily, challenge and practice runs, split by ranked.">
                <DataTable
                    rows={runTypes}
                    columns={[
                        { header: "Run type", cell: (row) => titleCase(row.runType) },
                        { header: "Ranked", cell: (row) => (row.ranked ? "Yes" : "No") },
                        { header: "Games", numeric: true, cell: (row) => formatValue(row.games, "count") },
                        { header: "Share", numeric: true, cell: (row) => formatValue(row.games / Math.max(1, kpis.games), "percent") },
                        { header: "Players", numeric: true, cell: (row) => formatValue(row.players, "count") },
                    ]}
                />
            </Panel>

            <Panel title="Rule and pp versions">
                <DataTable
                    rows={versions}
                    columns={[
                        { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
                        { header: "Variant", cell: (row) => titleCase(row.variant) },
                        { header: "Rules / pp", cell: (row) => `v${row.rulesetVersion} / v${row.ppVersion}` },
                        { header: "Games", numeric: true, cell: (row) => formatValue(row.games, "count") },
                        { header: "Accuracy", numeric: true, cell: (row) => formatValue(row.accuracy, "percent") },
                        { header: "Avg pp", numeric: true, cell: (row) => formatValue(row.avgPp, "decimal") },
                        { header: "Quit", numeric: true, cell: (row) => formatValue(row.quitRate, "percent") },
                    ]}
                />
            </Panel>
        </Section>
    );
}

export function RunsSection({ data }: { data: Analytics }) {
    const { streaks, runLengths, sessionLengths } = data.runs;
    const runLengthLabels = runLengths[0]?.bins.map((bin) => bin.label) ?? [];

    return (
        <Section id="runs" title="Runs" description="Run lengths are available for games with round data.">
            {["survival", "death"].map((variant) => {
                const distribution = streaks.find((group) => group.group === variant);
                return (
                    <Panel key={variant} title={`${titleCase(variant)} final streaks`}>
                        <ColumnChart
                            label={`${variant} final streak distribution`}
                            categories={distribution?.bins.map((bin) => bin.label) ?? []}
                            series={[{ key: "runs", label: "Runs", color: NEUTRAL_SERIES }]}
                            values={[distribution?.bins.map((bin) => bin.count) ?? []]}
                            categoryHeader="Streak"
                        />
                    </Panel>
                );
            })}

            <Panel title="Run length by end reason">
                <ColumnChart
                    label="Run length by end reason"
                    categories={runLengthLabels}
                    series={runLengths.map((group) => ({ key: group.group, label: titleCase(group.group), color: END_REASON_COLORS[group.group] ?? NEUTRAL_SERIES }))}
                    values={runLengths.map((group) => group.bins.map((bin) => bin.count))}
                    categoryHeader="Rounds"
                />
            </Panel>

            <Panel title="Game length" description="Wall-clock time from start to finish.">
                <ColumnChart
                    label="Game length distribution"
                    categories={sessionLengths.map((bin) => bin.label)}
                    series={[{ key: "games", label: "Games", color: NEUTRAL_SERIES }]}
                    values={[sessionLengths.map((bin) => bin.count)]}
                    categoryHeader="Length"
                />
            </Panel>
        </Section>
    );
}

export function RoundsSection({ data }: { data: Analytics }) {
    const { fatigue, pressure, resultMix, timerUsage, calibration } = data.rounds;
    const rateSeries = [OUTCOME_SERIES.accuracy, OUTCOME_SERIES.skipRate, OUTCOME_SERIES.timeoutRate];
    const rateValues = (points: typeof fatigue) => rateSeries.map((series) => points.map((point) => point[series.key as "accuracy" | "skipRate" | "timeoutRate"]));
    const sampleNotes = (points: typeof fatigue) => points.map((point) => `${formatValue(point.rounds, "count")} rounds`);

    return (
        <Section id="rounds" title="Rounds">
            <Panel title="Round outcomes by mode" wide>
                <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <li>
                        <Swatch color={OUTCOME_COLORS.correct} label="Correct" />
                    </li>
                    <li>
                        <Swatch color={OUTCOME_COLORS.wrong} label="Wrong guess" />
                    </li>
                    <li>
                        <Swatch color={OUTCOME_COLORS.skipped} label="Skipped" />
                    </li>
                    <li>
                        <Swatch color={OUTCOME_COLORS.timedOut} label="Timed out" />
                    </li>
                </ul>
                {resultMix.length === 0 ? (
                    <Note>No rounds in this range.</Note>
                ) : (
                    <div className="space-y-3">
                        {resultMix.map((row) => (
                            <div key={row.gameMode} className="grid items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_5rem]">
                                <ModeLabel mode={row.gameMode} />
                                <SegmentedBar
                                    label={`${MODE_LABELS[row.gameMode]} round outcomes`}
                                    parts={[
                                        { key: "correct", label: "Correct", color: OUTCOME_COLORS.correct, value: row.correct },
                                        { key: "wrong", label: "Wrong guess", color: OUTCOME_COLORS.wrong, value: row.wrong },
                                        { key: "skipped", label: "Skipped", color: OUTCOME_COLORS.skipped, value: row.skipped, darkText: true },
                                        { key: "timedOut", label: "Timed out", color: OUTCOME_COLORS.timedOut, value: row.timedOut, darkText: true },
                                    ]}
                                />
                                <span className="text-right text-xs tabular-nums text-muted-foreground">{formatValue(row.correct + row.wrong + row.skipped + row.timedOut, "count")} rounds</span>
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            <Panel title="Outcomes by round number">
                <LineChart
                    label="Outcome rates by round number"
                    categories={fatigue.map((point) => point.label)}
                    series={rateSeries}
                    values={rateValues(fatigue)}
                    notes={sampleNotes(fatigue)}
                    categoryHeader="Round"
                />
            </Panel>

            <Panel title="Fatigue: response time by round number">
                <LineChart
                    label="Average response time by round number"
                    categories={fatigue.map((point) => point.label)}
                    series={[{ key: "ms", label: "Avg response", color: NEUTRAL_SERIES }]}
                    values={[fatigue.map((point) => point.avgResponseMs)]}
                    format="ms"
                    notes={sampleNotes(fatigue)}
                    categoryHeader="Round"
                />
            </Panel>

            <Panel title="Outcomes by current streak">
                <LineChart
                    label="Outcome rates by streak before the round"
                    categories={pressure.map((point) => point.label)}
                    series={rateSeries}
                    values={rateValues(pressure)}
                    notes={sampleNotes(pressure)}
                    categoryHeader="Streak"
                />
            </Panel>

            <Panel
                title="Timer use"
                description="Percentage of the timer used before answering."
            >
                <ColumnChart
                    label="Answers by share of timer used"
                    categories={timerUsage.map((bin) => bin.label)}
                    series={[
                        { key: "correct", label: "Correct", color: OUTCOME_COLORS.correct },
                        { key: "wrong", label: "Wrong guess", color: OUTCOME_COLORS.wrong },
                        { key: "skipped", label: "Skipped", color: OUTCOME_COLORS.skipped },
                    ]}
                    values={[timerUsage.map((bin) => bin.correct), timerUsage.map((bin) => bin.wrong), timerUsage.map((bin) => bin.skipped)]}
                    categoryHeader="Timer used"
                />
            </Panel>

            <Panel
                title="Difficulty calibration"
                description="Rounds are grouped by their difficulty at the time of play."
                wide
            >
                <LineChart
                    label="Accuracy by difficulty decile"
                    categories={calibration.map((bin) => `${bin.minDifficulty.toFixed(3)}–${bin.maxDifficulty.toFixed(3)}`)}
                    series={[OUTCOME_SERIES.accuracy]}
                    values={[calibration.map((bin) => bin.accuracy)]}
                    notes={calibration.map((bin) => `${formatValue(bin.rounds, "count")} rounds, avg ${formatValue(bin.avgResponseMs, "ms")}`)}
                    categoryHeader="Difficulty"
                />
            </Panel>
        </Section>
    );
}

const itemColumns: Array<Column<ItemStat>> = [
    { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
    { header: "Answer", cell: (row) => <ItemLink item={row} /> },
    { header: "Shown", numeric: true, cell: (row) => formatValue(row.appearances, "count") },
    { header: "Correct", numeric: true, cell: (row) => formatValue(row.accuracy, "percent") },
    { header: "Skipped", numeric: true, cell: (row) => formatValue(row.skipRate, "percent") },
    { header: "Timeouts", numeric: true, cell: (row) => formatValue(row.timeoutRate, "percent") },
    { header: "Avg time", numeric: true, cell: (row) => formatValue(row.avgResponseMs, "ms") },
    { header: "Difficulty", numeric: true, cell: (row) => (row.difficulty === null ? "–" : row.difficulty.toFixed(3)) },
];

const quickSkipColumns: Array<Column<ItemStat>> = itemColumns.map((column) =>
    column.header === "Avg time" ? { header: "Avg skip time", numeric: true, cell: (row) => formatValue(row.avgSkipMs, "ms") } : column,
);

const guessColumns: Array<Column<WrongGuess>> = [
    { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
    { header: "Guess", cell: (row) => <span className="font-mono text-xs">{row.guess}</span> },
    { header: "Answer", cell: (row) => <ItemLink item={row} /> },
    { header: "Times", numeric: true, cell: (row) => formatValue(row.count, "count") },
];

export function ContentSection({ data }: { data: Analytics }) {
    const { items, wrongGuesses, coverage, eras, scorePpSources, reports } = data.content;
    const hardest = [...items].sort((a, b) => a.accuracy - b.accuracy || b.appearances - a.appearances).slice(0, 20);
    const easiest = [...items].sort((a, b) => b.accuracy - a.accuracy || b.appearances - a.appearances).slice(0, 10);
    const quickSkips = items
        .filter((item) => item.skipRate >= 0.5 && item.avgSkipMs !== null && item.avgSkipMs < QUICK_SKIP_MS)
        .sort((a, b) => b.skipRate - a.skipRate || b.appearances - a.appearances)
        .slice(0, 15);
    const mostShown = [...items].sort((a, b) => b.appearances - a.appearances).slice(0, 10);

    return (
        <Section
            id="content"
            title="Content"
            description="Only items shown at least 3 times in this period are listed."
        >
            <Panel title="Wrong guesses" description="Near misses are rejected guesses that resemble the answer." wide>
                <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <li>
                        <Swatch color={EXTRA_SERIES[0]} label={`Near miss (${formatValue(wrongGuesses.byKind.near_miss, "count")})`} />
                    </li>
                    <li>
                        <Swatch color={EXTRA_SERIES[1]} label={`Typed the artist (${formatValue(wrongGuesses.byKind.artist, "count")})`} />
                    </li>
                    <li>
                        <Swatch color={OUTCOME_COLORS.skipped} label={`Unrelated (${formatValue(wrongGuesses.byKind.other, "count")})`} />
                    </li>
                </ul>
                <SegmentedBar
                    label="Wrong guesses by kind"
                    parts={[
                        { key: "near", label: "Near miss", color: EXTRA_SERIES[0], value: wrongGuesses.byKind.near_miss },
                        { key: "artist", label: "Typed the artist", color: EXTRA_SERIES[1], value: wrongGuesses.byKind.artist },
                        { key: "other", label: "Unrelated", color: OUTCOME_COLORS.skipped, value: wrongGuesses.byKind.other, darkText: true },
                    ]}
                />
            </Panel>

            <Panel title="Near misses">
                <DataTable rows={wrongGuesses.nearMisses} columns={guessColumns} empty="No near misses in this range" />
            </Panel>

            <Panel title="Artist typed instead of title">
                <DataTable rows={wrongGuesses.artistConfusions} columns={guessColumns} empty="Nobody typed the artist in this range" />
            </Panel>

            <Panel title="Most common wrong guesses" description="Excludes near misses." wide>
                <DataTable rows={wrongGuesses.common} columns={guessColumns} />
            </Panel>

            <Panel title="Hardest content" description="Sorted by lowest accuracy." wide>
                <DataTable rows={hardest} columns={itemColumns} />
            </Panel>

            <Panel title="Instant skips" description={`Skipped at least half the time, usually within ${QUICK_SKIP_MS / 1000}s.`} wide>
                <DataTable rows={quickSkips} columns={quickSkipColumns} empty="No items are being instantly skipped" />
            </Panel>

            <Panel title="Easiest content">
                <DataTable rows={easiest} columns={itemColumns.slice(0, 5)} />
            </Panel>

            <Panel title="Most shown content">
                <DataTable rows={mostShown} columns={itemColumns.slice(0, 5)} />
            </Panel>

            <Panel title="Pool coverage" description="Distinct items shown in this range versus the size of the pool.">
                <DataTable
                    rows={coverage}
                    columns={[
                        { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
                        { header: "Shown", numeric: true, cell: (row) => formatValue(row.shown, "count") },
                        { header: "Pool", numeric: true, cell: (row) => formatValue(row.pool, "count") },
                        { header: "Coverage", numeric: true, cell: (row) => formatValue(row.pool > 0 ? row.shown / row.pool : null, "percent") },
                    ]}
                />
            </Panel>

            <Panel title="Accuracy by ranked year">
                {eras.length === 0 ? (
                    <Note>No rounds with a ranked date in this range.</Note>
                ) : (
                    <LineChart
                        label="Accuracy and skip rate by ranked year"
                        categories={eras.map((row) => String(row.year))}
                        series={[OUTCOME_SERIES.accuracy, OUTCOME_SERIES.skipRate]}
                        values={[eras.map((row) => row.accuracy), eras.map((row) => row.skipRate)]}
                        notes={eras.map((row) => `${formatValue(row.rounds, "count")} rounds`)}
                        categoryHeader="Ranked year"
                    />
                )}
            </Panel>

            <Panel title="Score PP pair sources">
                <DataTable
                    rows={scorePpSources}
                    columns={[
                        { header: "Source", cell: (row) => row.source },
                        { header: "Rounds", numeric: true, cell: (row) => formatValue(row.rounds, "count") },
                        { header: "Correct", numeric: true, cell: (row) => formatValue(row.accuracy, "percent") },
                        { header: "Avg time", numeric: true, cell: (row) => formatValue(row.avgResponseMs, "ms") },
                    ]}
                />
            </Panel>

            <Panel title="Reports">
                <DataTable
                    rows={reports.byType}
                    columns={[
                        { header: "Type", cell: (row) => titleCase(row.reportType) },
                        { header: "Open", numeric: true, cell: (row) => formatValue(row.open, "count") },
                        { header: "Closed", numeric: true, cell: (row) => formatValue(row.closed, "count") },
                    ]}
                />
                <div className="mt-5">
                    <DataTable
                        rows={reports.topMapsets}
                        empty="No reported mapsets"
                        columns={[
                            { header: "Most reported mapsets", cell: (row) => <ItemLink item={{ itemType: "mapset", itemId: row.mapsetId, answer: row.title ?? `#${row.mapsetId}` }} /> },
                            { header: "Reports", numeric: true, cell: (row) => formatValue(row.reports, "count") },
                            { header: "Open", numeric: true, cell: (row) => formatValue(row.open, "count") },
                        ]}
                    />
                </div>
            </Panel>
        </Section>
    );
}

function retentionCell(retention: { returned: number; eligible: number }, users: number) {
    if (retention.eligible === 0) return <span className="text-muted-foreground">–</span>;
    return (
        <span title={`${retention.returned} of ${retention.eligible} eligible users`}>
            {formatValue(retention.returned / retention.eligible, "percent")}
            {retention.eligible < users && <span className="text-muted-foreground">*</span>}
        </span>
    );
}

export function PlayersSection({ data }: { data: Analytics }) {
    const { cohorts, firstModes, activity, transitions, progression } = data.players;
    const fromModes = GAME_MODES.filter((mode) => transitions.some((transition) => transition.from === mode));
    const progressionModes = GAME_MODES.filter((mode) => progression.some((row) => row.gameMode === mode));

    return (
        <Section
            id="players"
            title="Players"
            description="A player counts as returning if they finished a game at least the listed number of days after signup."
        >
            <Panel title="Retention by signup week" description="An asterisk means part of the cohort is too new to count yet." wide>
                <DataTable
                    rows={cohorts}
                    columns={[
                        { header: "Signup week", cell: (row) => shortDate(row.cohort) },
                        { header: "Signups", numeric: true, cell: (row) => formatValue(row.users, "count") },
                        { header: "Played a game", numeric: true, cell: (row) => formatValue(row.played / Math.max(1, row.users), "percent") },
                        ...RETENTION_DAYS.map((days, index) => ({
                            header: `Day ${days}+`,
                            numeric: true,
                            cell: (row: (typeof cohorts)[number]) => retentionCell(row.retention[index], row.users),
                        })),
                    ]}
                />
            </Panel>

            <Panel title="Retention by first mode" description="Players whose first-ever game was in this range, by the mode they started with. Returned means they played again 7+ days later.">
                <DataTable
                    rows={firstModes}
                    columns={[
                        { header: "First mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
                        { header: "Players", numeric: true, cell: (row) => formatValue(row.players, "count") },
                        { header: "Returned", numeric: true, cell: (row) => formatValue(row.eligible > 0 ? row.returned / row.eligible : null, "percent") },
                        { header: "Avg games", numeric: true, cell: (row) => row.avgGames.toFixed(1) },
                    ]}
                />
            </Panel>

            <Panel title="Games per player">
                <ColumnChart
                    label="Players by number of games in range"
                    categories={activity.gamesPerPlayer.map((bin) => bin.label)}
                    series={[{ key: "players", label: "Players", color: NEUTRAL_SERIES }]}
                    values={[activity.gamesPerPlayer.map((bin) => bin.count)]}
                    categoryHeader="Games"
                />
                <div className="mt-4 grid grid-cols-3 gap-3">
                    {activity.topShare.map((share) => (
                        <div key={share.label}>
                            <p className="text-xs text-muted-foreground">{share.label} of players</p>
                            <p className="text-lg font-semibold">{formatValue(share.share, "percent")}</p>
                            <p className="text-xs text-muted-foreground">of all games</p>
                        </div>
                    ))}
                </div>
            </Panel>

            <Panel title="Mode switching" description="What players play next, by the mode of their previous game. Rows add up to 100%.">
                <DataTable
                    rows={fromModes}
                    columns={[
                        { header: "After", cell: (mode) => <ModeLabel mode={mode} /> },
                        ...GAME_MODES.map((to) => ({
                            header: MODE_LABELS[to],
                            numeric: true,
                            cell: (from: (typeof GAME_MODES)[number]) => {
                                const row = transitions.filter((transition) => transition.from === from);
                                const total = row.reduce((sum, transition) => sum + transition.count, 0);
                                const count = row.find((transition) => transition.to === to)?.count ?? 0;
                                return <span className={from === to ? "font-semibold" : undefined}>{formatValue(total > 0 ? count / total : null, "percent")}</span>;
                            },
                        })),
                    ]}
                />
            </Panel>

            <Panel title="Skill progression" description="Accuracy by how many games of that mode a player had played. Uses all history, not just this range.">
                <LineChart
                    label="Accuracy by player experience"
                    categories={[...PROGRESSION_LABELS]}
                    series={progressionModes.map((mode) => MODE_SERIES.find((series) => series.key === mode)!)}
                    values={progressionModes.map((mode) => PROGRESSION_LABELS.map((label) => progression.find((row) => row.gameMode === mode && row.label === label)?.accuracy ?? null))}
                    categoryHeader="Nth game"
                />
            </Panel>

            <Panel title="Most active players" wide>
                <DataTable
                    rows={activity.topPlayers}
                    columns={[
                        {
                            header: "Player",
                            cell: (row) => (
                                <Link href={`/user/${row.userId}`} className="hover:text-primary hover:underline">
                                    {row.username ?? `#${row.userId}`}
                                </Link>
                            ),
                        },
                        { header: "Games", numeric: true, cell: (row) => formatValue(row.games, "count") },
                        { header: "Modes", numeric: true, cell: (row) => row.modes },
                        { header: "Accuracy", numeric: true, cell: (row) => formatValue(row.accuracy, "percent") },
                        { header: "Best streak", numeric: true, cell: (row) => formatValue(row.bestStreak, "count") },
                    ]}
                />
            </Panel>
        </Section>
    );
}

export function ChallengesSection({ data }: { data: Analytics }) {
    const { challenges } = data;
    const shared = challenges.filter((challenge) => challenge.challengeType === "shared");

    return (
        <Section id="challenges" title="Challenges">
            {challenges.length === 0 ? (
                <Panel title="No challenges yet" wide>
                    <Note>No daily or shared challenges in this period.</Note>
                </Panel>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
                        <StatTile label="Challenges" value={challenges.length} format="count" />
                        <StatTile label="Challenge plays" value={challenges.reduce((sum, challenge) => sum + challenge.plays, 0)} format="count" />
                        <StatTile label="Shared challenges" value={shared.length} format="count" />
                        <StatTile label="Shared, played by others" value={shared.length > 0 ? shared.filter((challenge) => challenge.otherPlayers > 0).length / shared.length : null} format="percent" />
                    </div>
                    <Panel title="Recent challenges" wide>
                        <DataTable
                            rows={challenges}
                            columns={[
                                { header: "Type", cell: (row) => titleCase(row.challengeType) },
                                { header: "Date", cell: (row) => (row.dailyDate ?? row.createdAt).toISOString().slice(0, 10) },
                                { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
                                { header: "Variant", cell: (row) => titleCase(row.variant) },
                                { header: "Plays", numeric: true, cell: (row) => formatValue(row.plays, "count") },
                                { header: "Players", numeric: true, cell: (row) => formatValue(row.players, "count") },
                                { header: "Others", numeric: true, cell: (row) => formatValue(row.otherPlayers, "count") },
                                { header: "Completed", numeric: true, cell: (row) => formatValue(row.plays > 0 ? row.completed / row.plays : null, "percent") },
                                { header: "Avg points", numeric: true, cell: (row) => formatValue(row.avgPoints, "count") },
                            ]}
                        />
                    </Panel>
                </>
            )}
        </Section>
    );
}

export function MultiplayerSection({ data }: { data: Analytics }) {
    const { multiplayer } = data;

    return (
        <Section id="multiplayer" title="Multiplayer" description="Matches are identified from games tagged with their lobby match. Games played before tagging was added are not counted.">
            {multiplayer.matches === 0 ? (
                <Panel title="No tracked matches yet" wide>
                    <Note>
                        {multiplayer.trackedSince
                            ? `Matches have been tracked since ${multiplayer.trackedSince.toISOString().slice(0, 10)}, but none finished in this range.`
                            : "Multiplayer games are now tagged with their match. Stats appear here once matches finish after this release."}
                    </Note>
                </Panel>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
                        <StatTile label="Matches" value={multiplayer.matches} format="count" />
                        <StatTile label="Share of all games" value={multiplayer.shareOfGames} format="percent" />
                        <StatTile label="Avg players per match" value={multiplayer.avgPlayers} format="decimal" />
                        <StatTile label="Players who quit" value={multiplayer.quitRate} format="percent" upIsGood={false} />
                    </div>
                    <Panel title="Players per match">
                        <ColumnChart
                            label="Matches by player count"
                            categories={multiplayer.playersPerMatch.map((bin) => bin.label)}
                            series={[{ key: "matches", label: "Matches", color: NEUTRAL_SERIES }]}
                            values={[multiplayer.playersPerMatch.map((bin) => bin.count)]}
                            categoryHeader="Players"
                        />
                    </Panel>
                    <Panel title="Matches by mode">
                        <DataTable
                            rows={multiplayer.byMode}
                            columns={[
                                { header: "Mode", cell: (row) => <ModeLabel mode={row.gameMode} /> },
                                { header: "Matches", numeric: true, cell: (row) => formatValue(row.matches, "count") },
                                { header: "Avg players", numeric: true, cell: (row) => row.avgPlayers.toFixed(1) },
                            ]}
                        />
                    </Panel>
                </>
            )}
        </Section>
    );
}
