"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, BadgeCheck, Disc3, ExternalLink, FileText, Languages, Loader2, Megaphone, Paintbrush, RefreshCw, ShieldAlert, UserRoundCog } from "lucide-react";

import { addMapset, removeMapset, listMapsets, Mapset, addMapsetFromList } from "./actions/mapsets";
import { syncUserAchievements } from "./actions/update-outofsync-users";
import { checkTranslation, fillMissingTranslations, removeExtraTranslations, getAllLanguages } from "./actions/check-translations";
import { getBadges, addBadge, removeBadge, assignBadgeToUser, removeBadgeFromUser, listBadges, UserBadge } from "./actions/manage-badges";
import { listReports, updateReportStatus } from "./actions/reports";
import { listAnnouncements, addAnnouncement, removeAnnouncement } from "@/actions/announcements";
import { listSkins, removeSkin, addSkinById, addSkinsFromList } from "./actions/skins";
import { adminSetLock, adminUnlock, adminGetLock } from "./actions/lockdown";

import { AdminGroup, CollapsibleSection } from "./ui";
import Link from "next/link";

export default function AdminMenu() {
    const consoleDivRef = useRef<HTMLDivElement>(null);

    const [mapsetId, setMapsetId] = useState("");
    const [bulkFile, setBulkFile] = useState<File | null>(null);

    const [badgeUserId, setBadgeUserId] = useState("");
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

    const appendOutput = (text: string) => {
        setOutput((prev) => prev + "\n" + text);
    };

    useEffect(() => {
        const consoleElement = consoleDivRef.current;
        if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
    }, [output]);

    const loadAvailableBadges = useCallback(async () => {
        try {
            const badges = (await getBadges()) as Array<{ name: string; color: string }>;
            const badgeMap: Record<string, string> = {};
            badges.forEach((badge: { name: string; color: string }) => {
                badgeMap[badge.name] = badge.color;
            });
            setAvailableBadges(badgeMap);
        } catch (error) {
            appendOutput(`Error loading badges: ${error}`);
        }
    }, []);

    const loadAvailableLanguages = useCallback(async () => {
        const languages = await getAllLanguages();
        setAvailableLanguages(languages);
    }, []);

    const handleAddBadgeType = async () => {
        if (!newBadgeName || !newBadgeColor) return;
        setIsLoading(true);
        appendOutput(`Adding new badge type "${newBadgeName}"...`);
        try {
            const result = await addBadge(newBadgeName, newBadgeColor);
            appendOutput(result);
            await loadAvailableBadges();
            setNewBadgeName("");
            setNewBadgeColor("#000000");
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleRemoveBadgeType = async (badgeName: string) => {
        setIsLoading(true);
        appendOutput(`Removing badge type "${badgeName}"...`);
        try {
            const result = await removeBadge(badgeName);
            appendOutput(result);
            await loadAvailableBadges();
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleAddBadge = async () => {
        if (!badgeUserId || !badgeTitle) return;
        setIsLoading(true);
        appendOutput(`Adding badge to user ${badgeUserId}...`);
        try {
            const result = await assignBadgeToUser(parseInt(badgeUserId), badgeTitle);
            appendOutput(result);
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleRemoveBadge = async () => {
        if (!badgeUserId || !badgeTitle) return;
        setIsLoading(true);
        appendOutput(`Removing badge from user ${badgeUserId}...`);
        try {
            const result = await removeBadgeFromUser(parseInt(badgeUserId), badgeTitle);
            appendOutput(result);
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleListBadges = async () => {
        setIsLoading(true);
        appendOutput("Listing badges...");
        try {
            const badges = await listBadges();
            if (badges.length > 0) {
                appendOutput("Badges:");
                badges.forEach((b: UserBadge) => {
                    appendOutput(`${b.user_id} | ${b.username} | ${b.badge_name} | ${b.color} | ${b.assigned_at}`);
                });
            } else {
                appendOutput("No badges found");
            }
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleAddMapset = async () => {
        if (!mapsetId) return;
        setIsLoading(true);
        appendOutput(`Adding mapset ${mapsetId}...`);
        try {
            const res = await addMapset(parseInt(mapsetId));
            if (res?.success && res?.note === "already_exists") {
                appendOutput(`Mapset ${mapsetId}: already exists; skipped`);
            } else if (res?.success) {
                appendOutput("Mapset added");
            } else {
                appendOutput(`Error: ${res?.error ?? "Mapset import failed"}`);
            }
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleRemoveMapset = async () => {
        if (!mapsetId) return;
        setIsLoading(true);
        appendOutput(`Removing mapset ${mapsetId}...`);
        try {
            await removeMapset(parseInt(mapsetId));
            appendOutput("Mapset removed");
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleListMapsets = async () => {
        setIsLoading(true);
        appendOutput("Listing mapsets...");
        try {
            const mapsets = await listMapsets();
            if (mapsets.length > 0) {
                appendOutput("Mapsets:");
                mapsets.forEach((m: Mapset) => {
                    appendOutput(`${m.mapset_id} | ${m.title} | ${m.artist} | ${m.mapper} | ${m.image_filename} | ${m.audio_filename}`);
                });
            } else {
                appendOutput("No mapsets found");
            }
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleBulkUpload = async () => {
        if (!bulkFile) return;

        setIsLoading(true);
        appendOutput("Starting bulk upload process...");

        try {
            const content = await bulkFile.text();
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
        } catch (error) {
            appendOutput(`Error during bulk upload: ${error}`);
        } finally {
            setIsLoading(false);
            setBulkFile(null);
        }
    };

    const handleSyncUsers = async () => {
        setIsLoading(true);
        appendOutput("Syncing user achievements...");
        try {
            await syncUserAchievements();
            appendOutput("User achievements synced");
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleCheckTranslation = async () => {
        if (!languageCode) return;
        setIsLoading(true);
        appendOutput(`Checking translations for language: ${languageCode}`);
        try {
            const result = await checkTranslation(languageCode);
            if (result.success && result.extraKeys) {
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

                if (autoFill && result.missingKeys?.length > 0) {
                    const fillResult = await fillMissingTranslations(languageCode);
                    if (fillResult.success) {
                        appendOutput(`\nAuto-filled ${fillResult.filledCount} missing translations with English values`);
                    } else {
                        appendOutput(`\nError auto-filling translations: ${fillResult.error}`);
                    }
                }

                if (removeExtra && result.extraKeys?.length > 0) {
                    const removeResult = await removeExtraTranslations(languageCode);
                    if (removeResult.success) {
                        appendOutput(`\nRemoved ${removeResult.removedCount} extra translations`);
                    } else {
                        appendOutput(`\nError removing extra translations: ${removeResult.error}`);
                    }
                }
            } else {
                appendOutput(`Error: ${result.error}`);
            }
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleCheckAllLanguages = async () => {
        setIsLoading(true);
        appendOutput("Checking all translations...");

        for (const lang of availableLanguages) {
            appendOutput(`\nChecking ${lang}...`);
            setLanguageCode(lang);
            const result = await checkTranslation(lang);

            if (result.success && result.missingKeys) {
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
                    const fillResult = await fillMissingTranslations(lang);
                    if (fillResult.success) {
                        appendOutput(`\nAuto-filled ${fillResult.filledCount} missing translations with English values`);
                    } else {
                        appendOutput(`\nError auto-filling translations: ${fillResult.error}`);
                    }
                }

                if (removeExtra && result.extraKeys.length > 0) {
                    const removeResult = await removeExtraTranslations(lang);
                    if (removeResult.success) {
                        appendOutput(`\nRemoved ${removeResult.removedCount} extra translations`);
                    } else {
                        appendOutput(`\nError removing extra translations: ${removeResult.error}`);
                    }
                }
            } else {
                appendOutput(`Error: ${result.error}`);
            }
        }

        setLanguageCode("");
        setIsLoading(false);
    };

    const handleAddSkinById = async () => {
        if (!skinSingleId) return appendOutput("Provide skin id");
        setIsLoading(true);
        appendOutput(`Adding skin ${skinSingleId}...`);
        try {
            const res = (await addSkinById(parseInt(skinSingleId))) as { success: boolean; skinId?: number; image?: string; error?: string };
            if (res && res.success) {
                appendOutput(`Added skin ${res.skinId} -> ${res.image}`);
            } else {
                appendOutput(`Add skin failed: ${res?.error || JSON.stringify(res)}`);
            }
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleAddSkinsFromFile = async () => {
        if (!skinListFile) return appendOutput("Provide a .txt file with skin IDs (one per line)");
        setIsLoading(true);
        appendOutput(`Adding skins from file...`);
        try {
            const content = await skinListFile.text();
            const ids = content
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .map((v) => parseInt(v))
                .filter((n) => !Number.isNaN(n));

            if (ids.length === 0) {
                appendOutput("No valid IDs found in file");
                setIsLoading(false);
                return;
            }

            const results = await addSkinsFromList(ids);
            appendOutput(`Processed ${results.length} skins:`);
            results.forEach((r) => appendOutput(`${r.id} -> ${r.success ? `OK (${r.image})` : `FAILED (${r.error})`}`));
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
        setSkinListFile(null);
    };

    const handleListSkins = async () => {
        setIsLoading(true);
        appendOutput("Listing skins...");
        try {
            const skins = await listSkins();
            appendOutput(`Found ${skins.length} skins`);
            skins.forEach((s) => appendOutput(`${s.id} | ${s.name} | ${s.image_filename}`));
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleSetLock = async () => {
        setIsLoading(true);
        appendOutput(`Setting lockdown for ${lockMinutes} minute(s)...`);
        try {
            const info = await adminSetLock(Number(lockMinutes));
            appendOutput(`Lock set until ${new Date(info.until).toLocaleString()}`);
            setLockInfo(`Locked until ${new Date(info.until).toLocaleString()}`);
        } catch (error) {
            appendOutput(`Error setting lock: ${error}`);
        }
        setIsLoading(false);
    };

    const handleUnlock = async () => {
        setIsLoading(true);
        appendOutput(`Unlocking server...`);
        try {
            await adminUnlock();
            appendOutput(`Unlocked`);
            setLockInfo(null);
        } catch (error) {
            appendOutput(`Error unlocking: ${error}`);
        }
        setIsLoading(false);
    };

    const handleGetLock = async () => {
        setIsLoading(true);
        appendOutput(`Querying lock state...`);
        try {
            const info = await adminGetLock();
            if (info) {
                appendOutput(`Locked until ${new Date(info.until).toLocaleString()} by ${info.ownerId}`);
                setLockInfo(`Locked until ${new Date(info.until).toLocaleString()} by ${info.ownerId}`);
            } else {
                appendOutput(`Not locked`);
                setLockInfo(null);
            }
        } catch (error) {
            appendOutput(`Error querying lock: ${error}`);
        }
        setIsLoading(false);
    };

    const handleRemoveSkin = async () => {
        if (!skinRemoveId) return;
        setIsLoading(true);
        appendOutput(`Removing skin ${skinRemoveId}...`);
        try {
            const res = await removeSkin(parseInt(skinRemoveId));
            appendOutput(JSON.stringify(res));
            await handleListSkins();
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const loadAnnouncements = useCallback(async () => {
        setIsLoading(true);
        appendOutput("Loading announcements...");
        try {
            const res = (await listAnnouncements()) as Array<{ id: number; title: string; created_at: string }>;
            setAnnouncementsList(res);
            appendOutput(`Found ${res.length} announcements`);
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadAvailableBadges();
        loadAvailableLanguages();
        loadAnnouncements();
    }, [loadAvailableBadges, loadAvailableLanguages, loadAnnouncements]);

    const handleAddAnnouncement = async () => {
        if (!announcementTitle || !announcementContent) return;
        setIsLoading(true);
        appendOutput(`Adding announcement \"${announcementTitle}\"...`);
        try {
            await addAnnouncement(announcementTitle, announcementContent);
            appendOutput("Announcement added");
            setAnnouncementTitle("");
            setAnnouncementContent("");
            await loadAnnouncements();
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleRemoveAnnouncement = async (id: number) => {
        setIsLoading(true);
        appendOutput(`Removing announcement ${id}...`);
        try {
            await removeAnnouncement(id);
            appendOutput("Announcement removed");
            await loadAnnouncements();
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleListReports = async () => {
        setIsLoading(true);
        appendOutput("Listing reports...");
        try {
            const reports = await listReports();
            if (reports.length > 0) {
                appendOutput("Reports:");
                reports.forEach((report) => {
                    appendOutput(`${report.id} | ${report.user_id} | ${report.mapset_id} | ${report.report_type} | ${report.status} | ${new Date(report.created_at).toLocaleString()}`);
                });
            } else {
                appendOutput("No reports found");
            }
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    const handleUpdateReportStatus = async () => {
        if (!reportId) return;
        setIsLoading(true);
        appendOutput(`Updating report ${reportId} to ${reportStatus}...`);
        try {
            await updateReportStatus(parseInt(reportId), reportStatus);
            appendOutput(`Report ${reportId} updated`);
        } catch (error) {
            appendOutput(`Error: ${error}`);
        }
        setIsLoading(false);
    };

    return (
        <div className="container mx-auto max-w-7xl px-4 py-6 md:py-10">
            <header className="flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Owner tools</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Administration</h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Manage game content, moderation, and maintenance from one workspace.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {isLoading && (
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Working
                        </span>
                    )}
                    <Button asChild variant="outline">
                        <Link href="/admin/beatmaps">
                            Browse beatmaps
                            <ExternalLink />
                        </Link>
                    </Button>
                </div>
            </header>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
                <main className="min-w-0">
                    <CollapsibleSection id="mapsets" title="Mapsets" description="Import, remove, and inspect the beatmapsets used by the game." icon={<Disc3 />} defaultOpen>
                        <div className="space-y-7">
                            <AdminGroup title="Single mapset" description="Use an osu! beatmapset ID for a quick import or removal.">
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

                    <CollapsibleSection id="skins" title="Skins" description="Maintain the random skin pool and import skin records by ID." icon={<Paintbrush />}>
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

                    <CollapsibleSection id="badges" title="Badges" description="Assign existing badges to users and manage the badge types themselves." icon={<BadgeCheck />}>
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

                                <div className="mt-5 divide-y divide-border/50 border-y border-border/50">
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

                    <CollapsibleSection id="translations" title="Translations" description="Check locale coverage and optionally repair missing or extra keys." icon={<Languages />}>
                        <div className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label htmlFor="auto-fill" className="flex cursor-pointer items-start gap-3 border-b border-border/40 pb-4 sm:border-b-0 sm:pb-0">
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

                    <CollapsibleSection id="reports" title="Reports" description="Review submitted reports and move them through the moderation workflow." icon={<FileText />}>
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

                    <CollapsibleSection id="announcements" title="Announcements" description="Publish notices shown to users and remove old ones." icon={<Megaphone />}>
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
                                <div className="divide-y divide-border/50 border-y border-border/50">
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

                    <CollapsibleSection id="maintenance" title="User maintenance" description="Run owner-only maintenance tasks against user data." icon={<UserRoundCog />}>
                        <AdminGroup title="Achievements" description="Recalculate and synchronize user achievement state.">
                            <Button onClick={handleSyncUsers} disabled={isLoading}>
                                Sync user achievements
                            </Button>
                        </AdminGroup>
                    </CollapsibleSection>

                    <CollapsibleSection id="lockdown" title="Server lockdown" description="Temporarily block access while maintenance or recovery work is in progress." icon={<ShieldAlert />}>
                        <AdminGroup title="Access control">
                            <div className="mb-5 flex items-center gap-2 text-sm">
                                <span className={`size-2 rounded-full ${lockInfo ? "bg-destructive" : "bg-emerald-500"}`} />
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
                </main>

                <aside className="pt-5 lg:sticky lg:top-6 lg:self-start">
                    <div className="border-l border-border/60 pl-5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Activity className="size-4 text-primary" />
                                <h2 className="font-semibold">Activity</h2>
                            </div>
                            {isLoading && <span className="text-xs text-muted-foreground">Running</span>}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Results from admin actions appear here and stay visible while you work.</p>
                        <div ref={consoleDivRef} className="mt-4 h-80 overflow-y-auto border-y border-border/50 py-3 scrollbar-thin lg:h-[30rem]">
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
