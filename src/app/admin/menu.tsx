"use client";

import { useEffect, useState, useCallback, useRef, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, BadgeCheck, CalendarDays, Disc3, ExternalLink, FileText, Languages, Loader2, Megaphone, Paintbrush, RefreshCw, ShieldAlert, UserRoundCog } from "lucide-react";

import { addMapset, removeMapset, listMapsets, Mapset, addMapsetFromList } from "./actions/mapsets";
import { syncUserAchievements } from "./actions/update-outofsync-users";
import { checkTranslation, fillMissingTranslations, removeExtraTranslations, getAllLanguages } from "./actions/check-translations";
import { getBadges, addBadge, removeBadge, assignBadgeToUser, removeBadgeFromUser, listBadges, UserBadge } from "./actions/manage-badges";
import { listReports, updateReportStatus } from "./actions/reports";
import { listAnnouncements, addAnnouncement, removeAnnouncement } from "@/actions/announcements";
import { listSkins, removeSkin, addSkinById, addSkinsFromList } from "./actions/skins";
import { adminSetLock, adminUnlock, adminGetLock } from "./actions/lockdown";
import { listAdmins, setAdmin, type AdminUser } from "./actions/admins";
import { searchManualDailyContent, setManualDailyChallenge } from "./actions/daily-challenge";

import { AdminGroup, CollapsibleSection } from "./ui";
import Link from "next/link";

type ActionOptions = {
    startMessage?: string;
    errorMessage?: string | ((error: unknown) => string);
    onFinally?: () => void;
    setLoading?: boolean;
};

type ManualDailyOption = { id: number; label: string };

export default function AdminMenu() {
    const consoleDivRef = useRef<HTMLDivElement>(null);
    const dailyDatePickerRef = useRef<HTMLInputElement>(null);
    const dailySearchRequestIds = useRef(Array(5).fill(0));
    const skipDailySearchOnce = useRef(Array(5).fill(false));
    const dailyListboxId = useId();

    const [mapsetId, setMapsetId] = useState("");
    const [bulkFile, setBulkFile] = useState<File | null>(null);

    const [badgeUserId, setBadgeUserId] = useState("");
    const [adminUserId, setAdminUserId] = useState("");
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [badgeTitle, setBadgeTitle] = useState("");
    const [newBadgeName, setNewBadgeName] = useState("");
    const [newBadgeColor, setNewBadgeColor] = useState("#000000");
    const [availableBadges, setAvailableBadges] = useState<Record<string, string>>({});

    const [languageCode, setLanguageCode] = useState("");
    const [autoFill, setAutoFill] = useState(false);
    const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
    const [removeExtra, setRemoveExtra] = useState(false);

    const [output, setOutput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [lockMinutes, setLockMinutes] = useState(5);
    const [lockInfo, setLockInfo] = useState<string | null>(null);

    const [reportId, setReportId] = useState("");
    const [reportStatus, setReportStatus] = useState("pending");
    const [skinRemoveId, setSkinRemoveId] = useState("");
    const [announcementTitle, setAnnouncementTitle] = useState("");
    const [announcementContent, setAnnouncementContent] = useState("");
    const [announcementsList, setAnnouncementsList] = useState<Array<{ id: number; title: string; created_at: string }>>([]);
    const [skinSingleId, setSkinSingleId] = useState("");
    const [skinListFile, setSkinListFile] = useState<File | null>(null);
    const [manualDailyDate, setManualDailyDate] = useState("");
    const [manualDailyDateIso, setManualDailyDateIso] = useState("");
    const [manualDailyMode, setManualDailyMode] = useState("background");
    const [ignoreDailyRepetition, setIgnoreDailyRepetition] = useState(false);
    const [manualDailySearches, setManualDailySearches] = useState<string[]>(Array(5).fill(""));
    const [manualDailySearchResults, setManualDailySearchResults] = useState<ManualDailyOption[][]>(Array.from({ length: 5 }, () => []));
    const [manualDailySelections, setManualDailySelections] = useState<string[]>(Array(5).fill(""));
    const [searchingDailyRounds, setSearchingDailyRounds] = useState<boolean[]>(Array(5).fill(false));
    const [activeDailyRound, setActiveDailyRound] = useState<number | null>(null);
    const [activeDailyOptionIndices, setActiveDailyOptionIndices] = useState<number[]>(Array(5).fill(0));
    const [dailyOverwriteRequest, setDailyOverwriteRequest] = useState<string | null>(null);

    const appendOutput = useCallback((text: string) => {
        setOutput((prev) => prev + "\n" + text);
    }, []);

    const runAction = useCallback(
        async (action: () => Promise<void>, { startMessage, errorMessage, onFinally, setLoading = true }: ActionOptions = {}) => {
            if (setLoading) setIsLoading(true);
            if (startMessage) appendOutput(startMessage);

            try {
                await action();
            } catch (error) {
                appendOutput(typeof errorMessage === "function" ? errorMessage(error) : (errorMessage ?? `Error: ${error}`));
            } finally {
                if (setLoading) setIsLoading(false);
                onFinally?.();
            }
        },
        [appendOutput],
    );

    useEffect(() => {
        const consoleElement = consoleDivRef.current;
        if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
    }, [output]);

    const loadAvailableBadges = useCallback(async () => {
        await runAction(
            async () => {
                const badges = (await getBadges()) as Array<{ name: string; color: string }>;
                const badgeMap: Record<string, string> = {};
                badges.forEach((badge: { name: string; color: string }) => {
                    badgeMap[badge.name] = badge.color;
                });
                setAvailableBadges(badgeMap);
            },
            { errorMessage: (error) => `Error loading badges: ${error}`, setLoading: false },
        );
    }, [runAction]);

    const loadAvailableLanguages = useCallback(async () => {
        const languages = await getAllLanguages();
        setAvailableLanguages(languages);
    }, []);

    const handleAddBadgeType = async () => {
        if (!newBadgeName || !newBadgeColor) return;

        await runAction(
            async () => {
                const result = await addBadge(newBadgeName, newBadgeColor);
                appendOutput(result);
                await loadAvailableBadges();
                setNewBadgeName("");
                setNewBadgeColor("#000000");
            },
            { startMessage: `Adding new badge type "${newBadgeName}"...` },
        );
    };

    const handleRemoveBadgeType = async (badgeName: string) => {
        await runAction(
            async () => {
                const result = await removeBadge(badgeName);
                appendOutput(result);
                await loadAvailableBadges();
            },
            { startMessage: `Removing badge type "${badgeName}"...` },
        );
    };

    const handleAddBadge = async () => {
        if (!badgeUserId || !badgeTitle) return;

        await runAction(
            async () => {
                const result = await assignBadgeToUser(parseInt(badgeUserId), badgeTitle);
                appendOutput(result);
            },
            { startMessage: `Adding badge to user ${badgeUserId}...` },
        );
    };

    const handleRemoveBadge = async () => {
        if (!badgeUserId || !badgeTitle) return;

        await runAction(
            async () => {
                const result = await removeBadgeFromUser(parseInt(badgeUserId), badgeTitle);
                appendOutput(result);
            },
            { startMessage: `Removing badge from user ${badgeUserId}...` },
        );
    };

    const handleListBadges = async () => {
        await runAction(
            async () => {
                const badges = await listBadges();
                if (badges.length > 0) {
                    appendOutput("Badges:");
                    badges.forEach((b: UserBadge) => {
                        appendOutput(`${b.user_id} | ${b.username} | ${b.badge_name} | ${b.color} | ${b.assigned_at}`);
                    });
                } else {
                    appendOutput("No badges found");
                }
            },
            { startMessage: "Listing badges..." },
        );
    };

    const handleAddMapset = async () => {
        if (!mapsetId) return;

        await runAction(
            async () => {
                const res = await addMapset(parseInt(mapsetId));
                if (res?.success && res?.note === "already_exists") {
                    appendOutput(`Mapset ${mapsetId}: already exists; skipped`);
                } else if (res?.success) {
                    appendOutput("Mapset added");
                } else {
                    appendOutput(`Error: ${res?.error ?? "Mapset import failed"}`);
                }
            },
            { startMessage: `Adding mapset ${mapsetId}...` },
        );
    };

    const dailyChallengeRequest = JSON.stringify([manualDailyDate, manualDailyMode, ignoreDailyRepetition, manualDailySelections]);

    const handleSetManualDaily = async (overwrite = false) => {
        setIsLoading(true);
        appendOutput(`${overwrite ? "Overwriting" : "Setting"} ${manualDailyMode} daily challenge for ${manualDailyDate}...`);
        try {
            appendOutput(await setManualDailyChallenge(manualDailyDate, manualDailyMode, ignoreDailyRepetition, manualDailySelections.map(Number), overwrite));
            setDailyOverwriteRequest(null);
        } catch (error) {
            if (error instanceof Error && error.message.includes("DAILY_CHALLENGE_OVERWRITE_CONFIRMATION_REQUIRED")) {
                setDailyOverwriteRequest(dailyChallengeRequest);
            } else {
                appendOutput(`Error: ${error instanceof Error ? error.message : error}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timers = manualDailySearches.map((searchText, roundIndex) => {
            const query = searchText.trim();
            const requestId = ++dailySearchRequestIds.current[roundIndex];
            if (skipDailySearchOnce.current[roundIndex]) {
                skipDailySearchOnce.current[roundIndex] = false;
                setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? false : searching)));
                return null;
            }
            if (query.length < 2) {
                setManualDailySearchResults((current) => current.map((results, index) => (index === roundIndex ? [] : results)));
                setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? false : searching)));
                return null;
            }

            setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? true : searching)));
            return window.setTimeout(() => {
                void searchManualDailyContent(manualDailyMode, query)
                    .then((options) => {
                        if (dailySearchRequestIds.current[roundIndex] !== requestId) return;
                        setManualDailySearchResults((current) => current.map((items, index) => (index === roundIndex ? options : items)));
                        setActiveDailyOptionIndices((current) => current.map((selected, index) => (index === roundIndex ? 0 : selected)));
                    })
                    .catch((error: unknown) => {
                        if (dailySearchRequestIds.current[roundIndex] === requestId) {
                            appendOutput(`Could not search daily content: ${error instanceof Error ? error.message : error}`);
                        }
                    })
                    .finally(() => {
                        if (dailySearchRequestIds.current[roundIndex] === requestId) {
                            setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? false : searching)));
                        }
                    });
            }, 180);
        });

        return () => timers.forEach((timer) => timer && window.clearTimeout(timer));
    }, [appendOutput, manualDailyMode, manualDailySearches]);

    const selectManualDailyOption = (roundIndex: number, option: ManualDailyOption) => {
        skipDailySearchOnce.current[roundIndex] = true;
        setManualDailySelections((current) => current.map((selected, index) => (index === roundIndex ? String(option.id) : selected)));
        setManualDailySearches((current) => current.map((search, index) => (index === roundIndex ? option.label : search)));
        setManualDailySearchResults((current) => current.map((results, index) => (index === roundIndex ? [option] : results)));
        setActiveDailyRound(null);
    };

    const changeManualDailyMode = (mode: string) => {
        setDailyOverwriteRequest(null);
        setManualDailyMode(mode);
        if (mode === "skin" || mode === "score_pp") setIgnoreDailyRepetition(false);
        setManualDailySearches(Array(5).fill(""));
        setManualDailySearchResults(Array.from({ length: 5 }, () => []));
        setManualDailySelections(Array(5).fill(""));
        skipDailySearchOnce.current = Array(5).fill(false);
        setActiveDailyRound(null);
    };

    const updateManualDailyDate = (value: string) => {
        setDailyOverwriteRequest(null);
        setManualDailyDate(value);
        const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        if (!match) {
            setManualDailyDateIso("");
            return;
        }
        const [, day, month, year] = match;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        setManualDailyDateIso(date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? `${year}-${month}-${day}` : "");
    };

    const updateManualDailyDateFromPicker = (value: string) => {
        if (!value) return updateManualDailyDate("");
        const [year, month, day] = value.split("-");
        updateManualDailyDate(`${day}/${month}/${year}`);
    };

    const handleRemoveMapset = async () => {
        if (!mapsetId) return;

        await runAction(
            async () => {
                await removeMapset(parseInt(mapsetId));
                appendOutput("Mapset removed");
            },
            { startMessage: `Removing mapset ${mapsetId}...` },
        );
    };

    const handleListMapsets = async () => {
        await runAction(
            async () => {
                const mapsets = await listMapsets();
                if (mapsets.length > 0) {
                    appendOutput("Mapsets:");
                    mapsets.forEach((m: Mapset) => {
                        appendOutput(`${m.mapset_id} | ${m.title} | ${m.artist} | ${m.mapper} | ${m.image_filename} | ${m.audio_filename}`);
                    });
                } else {
                    appendOutput("No mapsets found");
                }
            },
            { startMessage: "Listing mapsets..." },
        );
    };

    const handleBulkUpload = async () => {
        if (!bulkFile) return;

        const file = bulkFile;
        await runAction(
            async () => {
                const content = await file.text();
                const result = await addMapsetFromList(content);

                appendOutput(`Bulk upload completed: Total ${result.total}, Successful ${result.successful}, Failed ${result.failed}`);

                if (result.results && result.results.length > 0) {
                    appendOutput("Details:");
                    result.results.forEach((r: { id: number; success: boolean; error?: string; note?: string }) => {
                        if (r.success && r.note === "already_exists") {
                            appendOutput(`Mapset ${r.id}: already exists; skipped`);
                        } else if (r.success) {
                            appendOutput(`Mapset ${r.id}: added`);
                        } else {
                            appendOutput(`Mapset ${r.id}: failed: ${r.error}`);
                        }
                    });
                }
            },
            { startMessage: "Importing mapsets...", errorMessage: (error) => `Error during bulk upload: ${error}`, onFinally: () => setBulkFile(null) },
        );
    };

    const handleSyncUsers = async () => {
        await runAction(
            async () => {
                await syncUserAchievements();
                appendOutput("User stats synced");
            },
            { startMessage: "Syncing user stats..." },
        );
    };

    const loadAdmins = useCallback(async () => {
        await runAction(
            async () => {
                setAdmins(await listAdmins());
            },
            { errorMessage: (error) => `Error loading admins: ${error}`, setLoading: false },
        );
    }, [runAction]);

    const handleGrantAdmin = async () => {
        if (!adminUserId) return;

        const userId = parseInt(adminUserId);
        await runAction(
            async () => {
                appendOutput(await setAdmin(userId, true));
                setAdminUserId("");
                await loadAdmins();
            },
            { startMessage: `Granting admin to user ${adminUserId}...` },
        );
    };

    const handleRemoveAdmin = async (user: AdminUser) => {
        await runAction(
            async () => {
                appendOutput(await setAdmin(user.banchoId, false));
                await loadAdmins();
            },
            { startMessage: `Removing admin from ${user.username}...` },
        );
    };

    const checkLanguage = async (language: string) => {
        const result = await checkTranslation(language);
        if (!result.success || !result.missingKeys || !result.extraKeys) {
            appendOutput(`Error: ${result.error}`);
            return;
        }

        appendOutput(`
    Translation check completed for ${result.languageCode}:
    Total keys: ${result.totalKeys}
    Completed: ${result.completedKeys}
    Missing: ${result.missingKeys.length}
    Extra: ${result.extraKeys.length}

    Missing keys:
    ${result.missingKeys.map((key) => `- ${key}`).join("\n")}

    Extra keys:
    ${result.extraKeys.map((key) => `- ${key}`).join("\n")}`);

        if (autoFill && result.missingKeys.length > 0) {
            const fillResult = await fillMissingTranslations(language);
            if (fillResult.success) {
                appendOutput(`\nAuto-filled ${fillResult.filledCount} missing translations with English values`);
            } else {
                appendOutput(`\nError auto-filling translations: ${fillResult.error}`);
            }
        }

        if (removeExtra && result.extraKeys.length > 0) {
            const removeResult = await removeExtraTranslations(language);
            if (removeResult.success) {
                appendOutput(`\nRemoved ${removeResult.removedCount} extra translations`);
            } else {
                appendOutput(`\nError removing extra translations: ${removeResult.error}`);
            }
        }
    };

    const handleCheckTranslation = async () => {
        if (!languageCode) return;

        const language = languageCode;
        await runAction(() => checkLanguage(language), { startMessage: `Checking translations for language: ${language}` });
    };

    const handleCheckAllLanguages = async () => {
        await runAction(
            async () => {
                for (const language of availableLanguages) {
                    appendOutput(`\nChecking ${language}...`);
                    setLanguageCode(language);
                    await checkLanguage(language);
                }
            },
            { startMessage: "Checking all translations...", onFinally: () => setLanguageCode("") },
        );
    };

    const handleAddSkinById = async () => {
        if (!skinSingleId) return appendOutput("Provide skin id");

        await runAction(
            async () => {
                const res = (await addSkinById(parseInt(skinSingleId))) as { success: boolean; skinId?: number; image?: string; error?: string };
                if (res && res.success) {
                    appendOutput(`Added skin ${res.skinId} -> ${res.image}`);
                } else {
                    appendOutput(`Add skin failed: ${res?.error || JSON.stringify(res)}`);
                }
            },
            { startMessage: `Adding skin ${skinSingleId}...` },
        );
    };

    const handleAddSkinsFromFile = async () => {
        if (!skinListFile) return appendOutput("Provide a .txt file with skin IDs (one per line)");

        const file = skinListFile;
        let shouldClearFile = true;
        await runAction(
            async () => {
                const content = await file.text();
                const ids = content
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((v) => parseInt(v))
                    .filter((n) => !Number.isNaN(n));

                if (ids.length === 0) {
                    appendOutput("No valid IDs found in file");
                    shouldClearFile = false;
                    return;
                }

                const results = await addSkinsFromList(ids);
                appendOutput(`Processed ${results.length} skins:`);
                results.forEach((r) => appendOutput(`${r.id} -> ${r.success ? `OK (${r.image})` : `FAILED (${r.error})`}`));
            },
            {
                startMessage: "Adding skins from file...",
                onFinally: () => {
                    if (shouldClearFile) setSkinListFile(null);
                },
            },
        );
    };

    const handleListSkins = async () => {
        await runAction(
            async () => {
                const skins = await listSkins();
                appendOutput(`Found ${skins.length} skins`);
                skins.forEach((s) => appendOutput(`${s.id} | ${s.name} | ${s.image_filename}`));
            },
            { startMessage: "Listing skins..." },
        );
    };

    const handleSetLock = async () => {
        await runAction(
            async () => {
                const info = await adminSetLock(Number(lockMinutes));
                appendOutput(`Lock set until ${new Date(info.until).toLocaleString()}`);
                setLockInfo(`Locked until ${new Date(info.until).toLocaleString()}`);
            },
            { startMessage: `Setting lockdown for ${lockMinutes} minute(s)...`, errorMessage: (error) => `Error setting lock: ${error}` },
        );
    };

    const handleUnlock = async () => {
        await runAction(
            async () => {
                await adminUnlock();
                appendOutput(`Unlocked`);
                setLockInfo(null);
            },
            { startMessage: "Unlocking server...", errorMessage: (error) => `Error unlocking: ${error}` },
        );
    };

    const handleGetLock = async () => {
        await runAction(
            async () => {
                const info = await adminGetLock();
                if (info) {
                    appendOutput(`Locked until ${new Date(info.until).toLocaleString()} by ${info.ownerId}`);
                    setLockInfo(`Locked until ${new Date(info.until).toLocaleString()} by ${info.ownerId}`);
                } else {
                    appendOutput(`Not locked`);
                    setLockInfo(null);
                }
            },
            { startMessage: "Querying lock state...", errorMessage: (error) => `Error querying lock: ${error}` },
        );
    };

    const handleRemoveSkin = async () => {
        if (!skinRemoveId) return;

        await runAction(
            async () => {
                const res = await removeSkin(parseInt(skinRemoveId));
                appendOutput(JSON.stringify(res));
                await handleListSkins();
            },
            { startMessage: `Removing skin ${skinRemoveId}...` },
        );
    };

    const loadAnnouncements = useCallback(async () => {
        await runAction(
            async () => {
                const res = (await listAnnouncements()) as Array<{ id: number; title: string; created_at: string }>;
                setAnnouncementsList(res);
                appendOutput(`Found ${res.length} announcements`);
            },
            { startMessage: "Loading announcements..." },
        );
    }, [appendOutput, runAction]);

    useEffect(() => {
        loadAvailableBadges();
        loadAvailableLanguages();
        loadAnnouncements();
        loadAdmins();
    }, [loadAvailableBadges, loadAvailableLanguages, loadAnnouncements, loadAdmins]);

    const handleAddAnnouncement = async () => {
        if (!announcementTitle || !announcementContent) return;

        await runAction(
            async () => {
                await addAnnouncement(announcementTitle, announcementContent);
                appendOutput("Announcement added");
                setAnnouncementTitle("");
                setAnnouncementContent("");
                await loadAnnouncements();
            },
            { startMessage: `Adding announcement \"${announcementTitle}\"...` },
        );
    };

    const handleRemoveAnnouncement = async (id: number) => {
        await runAction(
            async () => {
                await removeAnnouncement(id);
                appendOutput("Announcement removed");
                await loadAnnouncements();
            },
            { startMessage: `Removing announcement ${id}...` },
        );
    };

    const handleListReports = async () => {
        await runAction(
            async () => {
                const reports = await listReports();
                if (reports.length > 0) {
                    appendOutput("Reports:");
                    reports.forEach((report) => {
                        appendOutput(`${report.id} | ${report.user_id} | ${report.mapset_id} | ${report.report_type} | ${report.status} | ${new Date(report.created_at).toLocaleString()}`);
                    });
                } else {
                    appendOutput("No reports found");
                }
            },
            { startMessage: "Listing reports..." },
        );
    };

    const handleUpdateReportStatus = async () => {
        if (!reportId) return;

        await runAction(
            async () => {
                await updateReportStatus(parseInt(reportId), reportStatus);
                appendOutput(`Report ${reportId} updated`);
            },
            { startMessage: `Updating report ${reportId} to ${reportStatus}...` },
        );
    };

    const tomorrowUtc = new Date();
    tomorrowUtc.setUTCHours(0, 0, 0, 0);
    tomorrowUtc.setUTCDate(tomorrowUtc.getUTCDate() + 1);
    const minManualDailyDate = tomorrowUtc.toISOString().slice(0, 10);
    const hasFiveUniqueDailyItems = manualDailySelections.every(Boolean) && new Set(manualDailySelections).size === 5;

    return (
        <div className="page-container py-6 md:py-10">
            <header className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Administration</h1>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {isLoading && (
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
                            <Loader2 className="size-4 animate-spin" />
                            Running admin action…
                        </span>
                    )}
                    <Button asChild variant="outline">
                        <Link href="/admin/analytics">
                            Analytics
                            <ExternalLink />
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/admin/beatmaps">
                            Browse beatmaps
                            <ExternalLink />
                        </Link>
                    </Button>
                </div>
            </header>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
                <div className="min-w-0">
                    <CollapsibleSection id="mapsets" title="Mapsets" description="Import, remove, and inspect the beatmapsets used by the game." icon={<Disc3 />} defaultOpen>
                        <div className="space-y-7">
                            <AdminGroup title="Single mapset" description="Enter an osu! beatmapset ID.">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="mapset-id">Mapset ID</Label>
                                        <Input id="mapset-id" type="number" placeholder="1234567" value={mapsetId} onChange={(e) => setMapsetId(e.target.value)} />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button onClick={handleAddMapset} disabled={isLoading || !mapsetId}>
                                            Add
                                        </Button>
                                        <Button onClick={handleRemoveMapset} disabled={isLoading || !mapsetId} variant="destructive">
                                            Remove
                                        </Button>
                                        <Button onClick={handleListMapsets} disabled={isLoading} variant="outline">
                                            List all
                                        </Button>
                                    </div>
                                </div>
                            </AdminGroup>

                            <AdminGroup title="Bulk import" description="Upload a text file containing osu! beatmap URLs.">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="mapset-file">Beatmap URL list</Label>
                                        <Input id="mapset-file" type="file" accept=".txt" onChange={(e) => setBulkFile(e.target.files?.[0] || null)} />
                                    </div>
                                    <Button onClick={handleBulkUpload} disabled={isLoading || !bulkFile}>
                                        Import file
                                    </Button>
                                </div>
                            </AdminGroup>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="daily-challenge" title="Daily Challenge" description="Set daily challenge manually" icon={<CalendarDays />}>
                        <AdminGroup title="Schedule a challenge" description="Choose five exact rounds for a future date. Challenges cannot be set for today or an earlier UTC date.">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="manual-daily-date">Date (dd/mm/yyyy)</Label>
                                    <div className="relative flex gap-2">
                                        <Input
                                            id="manual-daily-date"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            placeholder="dd/mm/yyyy"
                                            maxLength={10}
                                            value={manualDailyDate}
                                            onChange={(event) => updateManualDailyDate(event.target.value)}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            aria-label="Choose date from calendar"
                                            onClick={() => {
                                                const picker = dailyDatePickerRef.current;
                                                if (!picker) return;
                                                if (typeof picker.showPicker === "function") picker.showPicker();
                                                else picker.click();
                                            }}
                                        >
                                            <CalendarDays aria-hidden="true" />
                                        </Button>
                                        <input
                                            ref={dailyDatePickerRef}
                                            className="pointer-events-none absolute right-0 top-0 size-1 opacity-0"
                                            type="date"
                                            tabIndex={-1}
                                            aria-hidden="true"
                                            min={minManualDailyDate}
                                            value={manualDailyDateIso}
                                            onChange={(event) => updateManualDailyDateFromPicker(event.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="manual-daily-mode">Game mode</Label>
                                    <Select value={manualDailyMode} onValueChange={changeManualDailyMode}>
                                        <SelectTrigger id="manual-daily-mode">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="background">Background Guessr</SelectItem>
                                            <SelectItem value="audio">Audio Guessr</SelectItem>
                                            <SelectItem value="skin">Skin Guessr</SelectItem>
                                            <SelectItem value="score_pp">Score pp</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <fieldset className="mt-6 border-t border-border/60 pt-5">
                                <legend className="mb-4 text-sm font-medium">Challenge rounds</legend>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {manualDailySearches.map((searchText, roundIndex) => {
                                        const otherSelections = new Set(manualDailySelections.filter((_, index) => index !== roundIndex));
                                        const options = manualDailySearchResults[roundIndex].filter((option) => !otherSelections.has(String(option.id)));
                                        const isOpen = activeDailyRound === roundIndex && searchText.trim().length >= 2;
                                        const activeOptionIndex = activeDailyOptionIndices[roundIndex];
                                        const listboxId = `${dailyListboxId}-round-${roundIndex}`;

                                        return (
                                            <div key={roundIndex} className="min-w-0 space-y-2">
                                                <Label htmlFor={`manual-daily-search-${roundIndex}`}>Round {roundIndex + 1}</Label>
                                                <div className="relative">
                                                    <Input
                                                        id={`manual-daily-search-${roundIndex}`}
                                                        placeholder={manualDailyMode === "score_pp" ? "Player or beatmap" : manualDailyMode === "skin" ? "Skin name or ID" : "Song title or artist"}
                                                        value={searchText}
                                                        onFocus={() => setActiveDailyRound(roundIndex)}
                                                        onBlur={(event) => {
                                                            const nextTarget = event.relatedTarget;
                                                            if (!(nextTarget instanceof Node && event.currentTarget.parentElement?.contains(nextTarget))) setActiveDailyRound(null);
                                                        }}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setDailyOverwriteRequest(null);
                                                            setManualDailySearches((current) => current.map((search, index) => (index === roundIndex ? value : search)));
                                                            setManualDailySelections((current) => current.map((selected, index) => (index === roundIndex ? "" : selected)));
                                                            setManualDailySearchResults((current) => current.map((results, index) => (index === roundIndex ? [] : results)));
                                                            setSearchingDailyRounds((current) => current.map((searching, index) => (index === roundIndex ? value.trim().length >= 2 : searching)));
                                                            setActiveDailyOptionIndices((current) => current.map((selected, index) => (index === roundIndex ? 0 : selected)));
                                                            setActiveDailyRound(roundIndex);
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "ArrowDown" && options.length > 0) {
                                                                event.preventDefault();
                                                                setActiveDailyOptionIndices((current) => current.map((value, index) => (index === roundIndex ? Math.min(value + 1, options.length - 1) : value)));
                                                            } else if (event.key === "ArrowUp" && options.length > 0) {
                                                                event.preventDefault();
                                                                setActiveDailyOptionIndices((current) => current.map((value, index) => (index === roundIndex ? Math.max(value - 1, 0) : value)));
                                                            } else if (event.key === "Enter") {
                                                                event.preventDefault();
                                                                const option = options[activeOptionIndex];
                                                                if (option) selectManualDailyOption(roundIndex, option);
                                                            } else if (event.key === "Escape") {
                                                                setActiveDailyRound(null);
                                                            }
                                                        }}
                                                        role="combobox"
                                                        aria-label={`Search content for round ${roundIndex + 1}`}
                                                        aria-autocomplete="list"
                                                        aria-expanded={isOpen}
                                                        aria-controls={isOpen ? listboxId : undefined}
                                                        aria-activedescendant={isOpen && options[activeOptionIndex] ? `${listboxId}-option-${activeOptionIndex}` : undefined}
                                                    />
                                                    {isOpen && (
                                                        <div
                                                            id={listboxId}
                                                            role="listbox"
                                                            aria-label={`Round ${roundIndex + 1} search results`}
                                                            className="motion-scale-in absolute z-50 mt-1 w-full origin-top overflow-hidden border border-border/60 bg-background shadow-lg"
                                                        >
                                                            <div className="max-h-[min(240px,35dvh)] divide-y divide-border/40 overflow-y-auto">
                                                                {searchingDailyRounds[roundIndex] ? (
                                                                    <p className="px-4 py-2.5 text-sm text-muted-foreground" role="status">
                                                                        Searching...
                                                                    </p>
                                                                ) : options.length > 0 ? (
                                                                    options.map((option, optionIndex) => (
                                                                        <button
                                                                            key={option.id}
                                                                            id={`${listboxId}-option-${optionIndex}`}
                                                                            type="button"
                                                                            role="option"
                                                                            aria-selected={optionIndex === activeOptionIndex}
                                                                            className={`w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-[background-color,color] ${optionIndex === activeOptionIndex ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary/50"}`}
                                                                            onMouseDown={(event) => event.preventDefault()}
                                                                            onMouseEnter={() =>
                                                                                setActiveDailyOptionIndices((current) => current.map((value, index) => (index === roundIndex ? optionIndex : value)))
                                                                            }
                                                                            onClick={() => selectManualDailyOption(roundIndex, option)}
                                                                        >
                                                                            {option.label}
                                                                        </button>
                                                                    ))
                                                                ) : (
                                                                    <p className="px-4 py-2.5 text-sm text-muted-foreground">No matches found</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </fieldset>
                            <div className="mt-5 flex items-start gap-3">
                                <Switch
                                    id="ignore-daily-repetition"
                                    checked={ignoreDailyRepetition}
                                    onCheckedChange={(checked) => {
                                        setDailyOverwriteRequest(null);
                                        setIgnoreDailyRepetition(checked);
                                    }}
                                    disabled={manualDailyMode === "skin" || manualDailyMode === "score_pp"}
                                />
                                <div className="space-y-1">
                                    <Label htmlFor="ignore-daily-repetition">Ignore mapset repetition checks</Label>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        {manualDailyMode === "score_pp" || manualDailyMode === "skin"
                                            ? "Mapset repetition checks do not apply to this mode."
                                            : "Allow mapsets used by another game mode on the same day or by this mode during the previous week."}
                                    </p>
                                </div>
                            </div>
                            {dailyOverwriteRequest === dailyChallengeRequest && (
                                <div className="mt-5 border-l-2 border-destructive py-1 pl-4" role="alert">
                                    <p className="text-sm font-medium">
                                        A {manualDailyMode} challenge is already scheduled for {manualDailyDate}.
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">Overwrite it with the five rounds currently selected?</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button variant="destructive" onClick={() => void handleSetManualDaily(true)} disabled={isLoading}>
                                            Overwrite challenge
                                        </Button>
                                        <Button variant="outline" onClick={() => setDailyOverwriteRequest(null)} disabled={isLoading}>
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <Button className="mt-5" onClick={() => void handleSetManualDaily()} disabled={isLoading || !manualDailyDate || !manualDailyDateIso || !hasFiveUniqueDailyItems}>
                                Set daily challenge
                            </Button>
                        </AdminGroup>
                    </CollapsibleSection>

                    <CollapsibleSection id="skins" title="Skins" description="Add or remove skins used by the game." icon={<Paintbrush />}>
                        <div className="space-y-7">
                            <AdminGroup title="Skin library">
                                <Button onClick={handleListSkins} disabled={isLoading} variant="outline">
                                    List skins
                                </Button>
                            </AdminGroup>

                            <AdminGroup title="Import skins" description="Add one skin directly, or upload a text file with one skin ID per line.">
                                <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                        <div className="space-y-2">
                                            <Label htmlFor="skin-id">Skin ID</Label>
                                            <Input id="skin-id" type="number" placeholder="12345" value={skinSingleId} onChange={(e) => setSkinSingleId(e.target.value)} />
                                        </div>
                                        <Button onClick={handleAddSkinById} disabled={isLoading || !skinSingleId}>
                                            Add skin
                                        </Button>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                        <div className="space-y-2">
                                            <Label htmlFor="skin-list-file">Skin ID list</Label>
                                            <Input id="skin-list-file" type="file" accept=".txt" onChange={(e) => setSkinListFile(e.target.files?.[0] || null)} />
                                        </div>
                                        <Button onClick={handleAddSkinsFromFile} disabled={isLoading || !skinListFile}>
                                            Import file
                                        </Button>
                                    </div>
                                </div>
                            </AdminGroup>

                            <AdminGroup title="Remove skin">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="remove-skin-id">Skin ID</Label>
                                        <Input id="remove-skin-id" type="number" placeholder="12345" value={skinRemoveId} onChange={(e) => setSkinRemoveId(e.target.value)} />
                                    </div>
                                    <Button onClick={handleRemoveSkin} disabled={isLoading || !skinRemoveId} variant="destructive">
                                        Remove skin
                                    </Button>
                                </div>
                            </AdminGroup>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="badges" title="Badges" description="Create badges and assign them to users." icon={<BadgeCheck />}>
                        <div className="space-y-7">
                            <AdminGroup title="User badge">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="badge-user-id">User ID</Label>
                                        <Input id="badge-user-id" type="number" placeholder="123456" value={badgeUserId} onChange={(e) => setBadgeUserId(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Badge type</Label>
                                        <Select value={badgeTitle} onValueChange={setBadgeTitle}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose a badge" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.keys(availableBadges).map((badge) => (
                                                    <SelectItem key={badge} value={badge}>
                                                        {badge}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {badgeTitle && (
                                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="size-3 rounded-full border border-border" style={{ backgroundColor: availableBadges[badgeTitle] }} />
                                        {availableBadges[badgeTitle]}
                                    </div>
                                )}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button onClick={handleAddBadge} disabled={isLoading || !badgeUserId || !badgeTitle}>
                                        Assign badge
                                    </Button>
                                    <Button onClick={handleRemoveBadge} disabled={isLoading || !badgeUserId || !badgeTitle} variant="destructive">
                                        Remove badge
                                    </Button>
                                    <Button onClick={handleListBadges} disabled={isLoading} variant="outline">
                                        List assignments
                                    </Button>
                                </div>
                            </AdminGroup>

                            <AdminGroup title="Badge types">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_4rem_auto] sm:items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="badge-name">Badge name</Label>
                                        <Input id="badge-name" placeholder="Contributor" value={newBadgeName} onChange={(e) => setNewBadgeName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="badge-color">Color</Label>
                                        <Input id="badge-color" type="color" value={newBadgeColor} onChange={(e) => setNewBadgeColor(e.target.value)} className="h-9 w-16 p-1" />
                                    </div>
                                    <Button onClick={handleAddBadgeType} disabled={isLoading || !newBadgeName || !newBadgeColor}>
                                        Add type
                                    </Button>
                                </div>

                                <div className="mt-5 divide-y divide-border/60 border-y border-border/60">
                                    {Object.entries(availableBadges).length === 0 ? (
                                        <p className="py-4 text-sm text-muted-foreground">No badge types found.</p>
                                    ) : (
                                        Object.entries(availableBadges).map(([name, color]) => (
                                            <div key={name} className="flex items-center justify-between gap-4 py-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="size-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: color }} />
                                                    <span className="truncate text-sm font-medium">{name}</span>
                                                    <span className="hidden text-xs text-muted-foreground sm:inline">{color}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => handleRemoveBadgeType(name)} disabled={isLoading} className="text-destructive hover:text-destructive">
                                                    Remove
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </AdminGroup>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="translations" title="Translations" description="Find missing or extra translation keys." icon={<Languages />}>
                        <div className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label htmlFor="auto-fill" className="flex cursor-pointer items-start gap-3 border-b border-border/60 pb-4 sm:border-b-0 sm:pb-0">
                                    <Switch id="auto-fill" checked={autoFill} onCheckedChange={setAutoFill} />
                                    <span>
                                        <span className="block text-sm font-medium">Fill missing keys</span>
                                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">Copy the English value into missing entries.</span>
                                    </span>
                                </label>
                                <label htmlFor="remove-extra" className="flex cursor-pointer items-start gap-3">
                                    <Switch id="remove-extra" checked={removeExtra} onCheckedChange={setRemoveExtra} />
                                    <span>
                                        <span className="block text-sm font-medium">Remove extra keys</span>
                                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">Delete keys that do not exist in English.</span>
                                    </span>
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <div className="space-y-2">
                                    <Label>Language</Label>
                                    <Select value={languageCode} onValueChange={setLanguageCode}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a language" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableLanguages.map((lang) => (
                                                <SelectItem key={lang} value={lang}>
                                                    {lang}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button onClick={handleCheckTranslation} disabled={isLoading || !languageCode}>
                                        Check language
                                    </Button>
                                    <Button onClick={handleCheckAllLanguages} disabled={isLoading} variant="outline">
                                        Check all
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="reports" title="Reports" description="Review player reports and update their status." icon={<FileText />}>
                        <div className="space-y-7">
                            <AdminGroup title="Report queue">
                                <Button onClick={handleListReports} disabled={isLoading} variant="outline">
                                    List reports
                                </Button>
                            </AdminGroup>

                            <AdminGroup title="Update status">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="report-id">Report ID</Label>
                                        <Input id="report-id" type="number" placeholder="42" value={reportId} onChange={(e) => setReportId(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select value={reportStatus} onValueChange={setReportStatus}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="investigating">Investigating</SelectItem>
                                                <SelectItem value="resolved">Resolved</SelectItem>
                                                <SelectItem value="rejected">Rejected</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button onClick={handleUpdateReportStatus} disabled={isLoading || !reportId}>
                                        Update
                                    </Button>
                                </div>
                            </AdminGroup>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="announcements" title="Announcements" description="Publish or remove announcements." icon={<Megaphone />}>
                        <div className="space-y-7">
                            <AdminGroup title="Create announcement">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="announcement-title">Title</Label>
                                        <Input id="announcement-title" placeholder="Service update" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="announcement-content">Content</Label>
                                        <Textarea id="announcement-content" placeholder="What should users know?" value={announcementContent} onChange={(e) => setAnnouncementContent(e.target.value)} rows={5} />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button onClick={handleAddAnnouncement} disabled={isLoading || !announcementTitle || !announcementContent}>
                                            Publish
                                        </Button>
                                        <Button onClick={loadAnnouncements} disabled={isLoading} variant="outline">
                                            <RefreshCw /> Refresh list
                                        </Button>
                                    </div>
                                </div>
                            </AdminGroup>

                            <AdminGroup title="Published announcements">
                                <div className="divide-y divide-border/60 border-y border-border/60">
                                    {announcementsList.length === 0 ? (
                                        <p className="py-4 text-sm text-muted-foreground">No announcements.</p>
                                    ) : (
                                        announcementsList.map((announcement) => (
                                            <div key={announcement.id} className="flex items-center justify-between gap-4 py-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium">{announcement.title}</div>
                                                    <div className="mt-1 text-xs text-muted-foreground">{new Date(announcement.created_at).toLocaleString()}</div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveAnnouncement(announcement.id)}
                                                    disabled={isLoading}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </AdminGroup>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="maintenance" title="User maintenance" description="Manage admin access and rebuild player stats." icon={<UserRoundCog />}>
                        <div className="space-y-7">
                            <AdminGroup title="Admin access" description="Admins can grant or revoke admin access for other users.">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor="admin-user-id">User ID</Label>
                                        <Input id="admin-user-id" type="number" min={1} placeholder="123456" value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} />
                                    </div>
                                    <Button onClick={handleGrantAdmin} disabled={isLoading || !adminUserId}>
                                        Grant admin
                                    </Button>
                                </div>

                                <div className="mt-5 divide-y divide-border/60 border-y border-border/60">
                                    {admins.map((admin) => (
                                        <div key={admin.banchoId} className="flex items-center justify-between gap-4 py-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">
                                                    {admin.username}
                                                    {admin.isOwner ? " · Owner" : ""}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">{admin.banchoId}</div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => handleRemoveAdmin(admin)} disabled={isLoading || admin.isOwner} className="text-destructive hover:text-destructive">
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </AdminGroup>

                            <AdminGroup title="Player stats">
                                <Button onClick={handleSyncUsers} disabled={isLoading}>
                                    Sync user stats
                                </Button>
                            </AdminGroup>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection id="lockdown" title="Server lockdown" description="Only the owner can access the site while it is locked." icon={<ShieldAlert />}>
                        <AdminGroup title="Access control">
                            <div className="mb-5 flex items-center gap-2 text-sm">
                                <span className={`size-2 rounded-full ${lockInfo ? "bg-destructive" : "bg-success"}`} />
                                <span className="font-medium">{lockInfo ?? "Server is unlocked"}</span>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[8rem_auto] sm:items-end">
                                <div className="space-y-2">
                                    <Label htmlFor="lock-minutes">Minutes</Label>
                                    <Input id="lock-minutes" type="number" min={1} value={String(lockMinutes)} onChange={(e) => setLockMinutes(Number(e.target.value))} />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button onClick={handleSetLock} disabled={isLoading || lockMinutes < 1} variant="destructive">
                                        Lock server
                                    </Button>
                                    <Button onClick={handleUnlock} disabled={isLoading} variant="outline">
                                        Unlock
                                    </Button>
                                    <Button onClick={handleGetLock} disabled={isLoading} variant="ghost">
                                        <RefreshCw /> Refresh state
                                    </Button>
                                </div>
                            </div>
                        </AdminGroup>
                    </CollapsibleSection>
                </div>

                <aside className="pt-5 lg:sticky lg:top-6 lg:self-start">
                    <div className="border-l border-border/60 pl-5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Activity className="size-4 text-primary" />
                                <h2 className="font-semibold">Activity</h2>
                            </div>
                            {isLoading && <span className="text-xs text-muted-foreground">Running</span>}
                        </div>
                        <div ref={consoleDivRef} className="mt-4 h-80 overflow-y-auto border-y border-border/60 py-3 scrollbar-thin lg:h-[30rem]">
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">{output.trim() || "No admin activity yet."}</pre>
                        </div>
                        <Button onClick={() => setOutput("")} disabled={!output} variant="ghost" size="sm" className="mt-2 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
                            Clear activity
                        </Button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
