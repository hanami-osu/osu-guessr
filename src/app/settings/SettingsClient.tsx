"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, deleteApiKeyAction, ApiKey, listApiKeysAction } from "@/actions/api-keys-server";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, AlertCircle, Loader2, Check, Copy, ExternalLink, LogOut } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useTranslationsContext } from "@/context/translations-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { languages, Locale } from "@/lib/translations";
import {
    AUDIO_AUTOPLAY_STORAGE_KEY,
    AUDIO_VOLUME_STORAGE_KEY,
    DEFAULT_AUDIO_AUTOPLAY,
    DEFAULT_AUDIO_VOLUME_PERCENT,
    SHORTCUTS_STORAGE_KEY,
    readAudioVolumePreference,
    readBooleanPreference,
} from "@/lib/game/preferences";
import { updateProfileBannerAction } from "@/actions/user-server";
import Image from "next/image";

interface SettingsClientProps {
    initialApiKeys: ApiKey[];
    initialBannerUrl: string | null;
    initialLoadError?: boolean;
}

export default function SettingsClient({ initialApiKeys, initialBannerUrl, initialLoadError = false }: SettingsClientProps) {
    const { t, locale, setLanguage } = useTranslationsContext();

    const [activeSection, setActiveSection] = useState("preferences");
    const sections = ["preferences", "profile", "account", "apiKeys", "privacy"] as const;

    const [apiKeys, setApiKeys] = useState<Array<ApiKey>>(initialApiKeys);
    const [loading, setLoading] = useState({
        keys: false,
        creation: false,
        deletion: false,
    });
    const [dialogs, setDialogs] = useState({
        create: false,
        delete: null as ApiKey | null,
        newKey: null as string | null,
    });
    const [newKeyName, setNewKeyName] = useState("");
    const [copied, setCopied] = useState(false);
    const [keyLoadError, setKeyLoadError] = useState<string | null>(initialLoadError ? t.settings.apiKeys.errors.loadFailed : null);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [copyError, setCopyError] = useState<string | null>(null);
    const [audioVolume, setAudioVolume] = useState(DEFAULT_AUDIO_VOLUME_PERCENT);
    const [audioAutoplay, setAudioAutoplay] = useState(DEFAULT_AUDIO_AUTOPLAY);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [bannerUrl, setBannerUrl] = useState(initialBannerUrl ?? "");
    const [savedBannerUrl, setSavedBannerUrl] = useState(initialBannerUrl);
    const [bannerSaving, setBannerSaving] = useState(false);
    const [bannerMessage, setBannerMessage] = useState<string | null>(null);
    const [bannerError, setBannerError] = useState<string | null>(null);

    useEffect(() => {
        try {
            setAudioVolume(readAudioVolumePreference(window.localStorage));
            setAudioAutoplay(readBooleanPreference(window.localStorage, AUDIO_AUTOPLAY_STORAGE_KEY, DEFAULT_AUDIO_AUTOPLAY));
            setShortcutsOpen(readBooleanPreference(window.localStorage, SHORTCUTS_STORAGE_KEY, false));
        } catch {}
    }, []);

    function storePreference(key: string, value: string) {
        try {
            window.localStorage.setItem(key, value);
        } catch {}
    }

    function handleAudioVolumeChange(value: number) {
        const nextVolume = Math.min(100, Math.max(0, value));
        setAudioVolume(nextVolume);
        storePreference(AUDIO_VOLUME_STORAGE_KEY, String(nextVolume));
    }

    async function saveBanner(nextValue = bannerUrl) {
        setBannerSaving(true);
        setBannerMessage(null);
        setBannerError(null);

        try {
            const saved = await updateProfileBannerAction(nextValue);
            setSavedBannerUrl(saved);
            setBannerUrl(saved ?? "");
            setBannerMessage(saved ? t.settings.profile.banner.saved : t.settings.profile.banner.resetDone);
        } catch (error) {
            console.error("Failed to update profile banner", error);
            setBannerError(t.settings.profile.banner.error);
        } finally {
            setBannerSaving(false);
        }
    }

    const loadApiKeys = useCallback(async () => {
        setLoading((prev) => ({ ...prev, keys: true }));
        setKeyLoadError(null);
        try {
            const keys = await listApiKeysAction();
            setApiKeys(keys);
        } catch (error) {
            console.error(t.settings.apiKeys.errors.loadFailed, error);
            setKeyLoadError(t.settings.apiKeys.errors.loadFailed);
        } finally {
            setLoading((prev) => ({ ...prev, keys: false }));
        }
    }, [t.settings.apiKeys.errors.loadFailed]);

    async function handleCreateKey() {
        if (!newKeyName.trim()) return;

        setLoading((prev) => ({ ...prev, creation: true }));
        setOperationError(null);
        try {
            const keyValue = await createApiKeyAction(newKeyName);
            await loadApiKeys();
            setNewKeyName("");
            setDialogs((prev) => ({ ...prev, create: false, newKey: keyValue }));
        } catch (error) {
            console.error(t.settings.apiKeys.errors.createFailed, error);
            setOperationError(t.settings.apiKeys.errors.createFailed);
        } finally {
            setLoading((prev) => ({ ...prev, creation: false }));
        }
    }

    async function handleDeleteKey() {
        if (!dialogs.delete) return;

        setLoading((prev) => ({ ...prev, deletion: true }));
        setOperationError(null);
        try {
            await deleteApiKeyAction(dialogs.delete.id);
            setApiKeys((prev) => prev.filter((key) => key.id !== dialogs.delete?.id));
            setDialogs((prev) => ({ ...prev, delete: null }));
        } catch (error) {
            console.error(t.settings.apiKeys.errors.deleteFailed, error);
            setOperationError(t.settings.apiKeys.errors.deleteFailed);
        } finally {
            setLoading((prev) => ({ ...prev, deletion: false }));
        }
    }

    async function copyKey(keyValue: string | null) {
        if (!keyValue) return;
        setCopyError(null);
        try {
            await navigator.clipboard.writeText(keyValue);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Failed to copy key", error);
            setCopyError(t.settings.apiKeys.errors.copyFailed);
        }
    }

    function handleCloseNewKeyDialog() {
        if (!copied) {
            const confirmed = window.confirm(t.settings.apiKeys.dialog.created.warning.description);
            if (!confirmed) return;
        }
        setDialogs((prev) => ({ ...prev, newKey: null }));
    }

    function renderKeyList() {
        if (loading.keys) {
            return (
                <div className="py-8 flex justify-center items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            );
        }

        if (keyLoadError) {
            return (
                <Alert variant="destructive" role="alert">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{keyLoadError}</AlertTitle>
                    <AlertDescription className="mt-3">
                        <Button type="button" size="sm" variant="outline" onClick={loadApiKeys}>
                            {t.settings.apiKeys.actions.retry}
                        </Button>
                    </AlertDescription>
                </Alert>
            );
        }

        if (apiKeys.length === 0) {
            return <p className="text-center py-4 text-muted-foreground">{t.settings.apiKeys.keyInfo.noKeys}</p>;
        }

        return apiKeys.map((key) => (
            <div key={key.id} className="py-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="font-medium">{key.name}</p>
                        <p className="text-sm text-muted-foreground">{t.settings.apiKeys.keyInfo.created.replace("{date}", new Date(key.created_at).toLocaleDateString(locale, { timeZone: "UTC" }))}</p>
                        {key.last_used ? (
                            <p className="text-sm text-muted-foreground">{t.settings.apiKeys.keyInfo.lastUsed.replace("{date}", new Date(key.last_used).toLocaleDateString(locale, { timeZone: "UTC" }))}</p>
                        ) : (
                            <p className="text-sm text-muted-foreground">{t.settings.apiKeys.keyInfo.neverUsed}</p>
                        )}
                    </div>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            setOperationError(null);
                            setDialogs((prev) => ({ ...prev, delete: key }));
                        }}
                        className="w-full sm:w-auto"
                    >
                        {t.settings.apiKeys.actions.delete}
                    </Button>
                </div>
            </div>
        ));
    }

    return (
        <main className="page-container pb-8 pt-3 md:pt-4">
            <div className="overflow-hidden rounded-2xl bg-card/70 shadow-sm">
                <header className="px-5 py-6 sm:px-7 md:px-9">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.settings.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.description}</p>
                </header>
                <nav aria-label={t.settings.title} className="flex flex-wrap gap-1.5 bg-muted/35 p-2.5 sm:px-4">
                    {sections.map((section) => (
                        <button
                            key={section}
                            type="button"
                            aria-pressed={activeSection === section}
                            aria-controls={`settings-${section}`}
                            onClick={() => setActiveSection(section)}
                            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${activeSection === section ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                            {t.settings[section].title}
                        </button>
                    ))}
                </nav>
                <div className="px-5 py-6 sm:px-7 md:px-9">

                    <section id="settings-profile" hidden={activeSection !== "profile"} aria-labelledby="settings-profile-title">
                        <h2 id="settings-profile-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.settings.profile.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t.settings.profile.description}</p>

                        <div className="mt-5">
                            <div className="relative h-40 overflow-hidden rounded-xl bg-muted sm:h-48 md:h-56">
                                <Image
                                    src={savedBannerUrl || "/main_bg.webp"}
                                    alt=""
                                    fill
                                    sizes="(min-width: 1280px) 1152px, 100vw"
                                    unoptimized={Boolean(savedBannerUrl)}
                                    loader={savedBannerUrl ? ({ src }) => src : undefined}
                                    referrerPolicy="no-referrer"
                                    className="object-cover object-center"
                                />
                                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent" />
                            </div>

                            <div className="mt-5 rounded-xl bg-muted/35 p-4 sm:p-5">
                                <label htmlFor="profile-banner-url" className="font-medium">
                                    {t.settings.profile.banner.title}
                                </label>
                                <p className="mt-1 text-sm text-muted-foreground">{t.settings.profile.banner.description}</p>
                                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                                    <Input
                                        id="profile-banner-url"
                                        type="url"
                                        inputMode="url"
                                        value={bannerUrl}
                                        onChange={(event) => {
                                            setBannerUrl(event.target.value);
                                            setBannerMessage(null);
                                            setBannerError(null);
                                        }}
                                        placeholder={t.settings.profile.banner.placeholder}
                                        className="flex-1"
                                    />
                                    <Button onClick={() => void saveBanner()} disabled={bannerSaving || bannerUrl.trim() === (savedBannerUrl ?? "")}>
                                        {bannerSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        {t.settings.profile.banner.save}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => void saveBanner("")}
                                        disabled={bannerSaving || (!savedBannerUrl && bannerUrl.trim().length === 0)}
                                    >
                                        {t.settings.profile.banner.reset}
                                    </Button>
                                </div>
                                {bannerMessage && <p role="status" className="mt-2 text-sm text-success">{bannerMessage}</p>}
                                {bannerError && <p role="alert" className="mt-2 text-sm text-destructive">{bannerError}</p>}
                            </div>
                        </div>
                    </section>

                    <section id="settings-preferences" hidden={activeSection !== "preferences"} aria-labelledby="settings-preferences-title">
                        <h2 id="settings-preferences-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.settings.preferences.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t.settings.preferences.description}</p>

                        <div className="mt-5 divide-y divide-border/60">
                            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-medium">{t.settings.preferences.language.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.preferences.language.description}</p>
                                </div>
                                <Select value={locale} onValueChange={(value) => setLanguage(value as Locale)}>
                                    <SelectTrigger className="w-full sm:w-48" aria-label={t.settings.preferences.language.title}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(languages).map(([code, name]) => (
                                            <SelectItem key={code} value={code}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-medium">{t.settings.preferences.audioVolume.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.preferences.audioVolume.description}</p>
                                </div>
                                <div className="flex w-full items-center gap-3 sm:w-auto">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="5"
                                        value={audioVolume}
                                        onChange={(event) => handleAudioVolumeChange(Number(event.target.value))}
                                        aria-label={t.settings.preferences.audioVolume.title}
                                        className="w-full accent-primary sm:w-44"
                                    />
                                    <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{audioVolume}%</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-6 py-5">
                                <div>
                                    <h3 className="font-medium">{t.settings.preferences.audioAutoplay.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.preferences.audioAutoplay.description}</p>
                                </div>
                                <Switch
                                    checked={audioAutoplay}
                                    onCheckedChange={(checked) => {
                                        setAudioAutoplay(checked);
                                        storePreference(AUDIO_AUTOPLAY_STORAGE_KEY, String(checked));
                                    }}
                                    aria-label={t.settings.preferences.audioAutoplay.title}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-6 py-5">
                                <div>
                                    <h3 className="font-medium">{t.settings.preferences.shortcuts.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.preferences.shortcuts.description}</p>
                                </div>
                                <Switch
                                    checked={shortcutsOpen}
                                    onCheckedChange={(checked) => {
                                        setShortcutsOpen(checked);
                                        storePreference(SHORTCUTS_STORAGE_KEY, String(checked));
                                    }}
                                    aria-label={t.settings.preferences.shortcuts.title}
                                />
                            </div>
                        </div>
                    </section>

                    <section id="settings-account" hidden={activeSection !== "account"} aria-labelledby="settings-account-title">
                        <h2 id="settings-account-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.settings.account.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t.settings.account.description}</p>

                        <div className="mt-5 divide-y divide-border/60">
                            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-medium">{t.settings.account.hanami.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.account.hanami.description}</p>
                                </div>
                                <Button variant="outline" asChild>
                                    <a href="https://hanami.yorunoken.com/profile" target="_blank" rel="noreferrer">
                                        {t.settings.account.hanami.action}
                                        <ExternalLink className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                            </div>

                            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-medium">{t.settings.account.signOut.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.account.signOut.description}</p>
                                </div>
                                <Button variant="outline" onClick={() => void signOut({ callbackUrl: "/" })}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    {t.settings.account.signOut.action}
                                </Button>
                            </div>
                        </div>
                    </section>

                    <section id="settings-apiKeys" hidden={activeSection !== "apiKeys"} aria-labelledby="settings-apiKeys-title">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
                            <div>
                                <h2 id="settings-apiKeys-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.settings.apiKeys.title}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">{t.settings.apiKeys.description}</p>
                            </div>
                            <div className="text-sm text-muted-foreground">{t.settings.apiKeys.usage.replace("{count}", apiKeys.length.toString())}</div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex flex-col gap-4">
                                <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>{t.settings.apiKeys.security.title}</AlertTitle>
                                    <AlertDescription>
                                        <div className="mt-2">
                                            <ul className="list-disc list-inside space-y-1">
                                                {Object.values(t.settings.apiKeys.security.points).map((point, i) => (
                                                    <li key={i}>{point}</li>
                                                ))}
                                            </ul>
                                            <div className="mt-2">
                                                <Link href="https://github.com/hanami-osu/osu-guessr/blob/main/docs/API.md" target="_blank" className="inline-block text-primary hover:underline">
                                                    {t.settings.apiKeys.actions.viewDocs} →
                                                </Link>
                                            </div>
                                        </div>
                                    </AlertDescription>
                                </Alert>

                                <Button
                                    onClick={() => {
                                        setOperationError(null);
                                        setDialogs((prev) => ({ ...prev, create: true }));
                                    }}
                                    disabled={apiKeys.length >= 5}
                                    className="w-full self-start sm:w-auto"
                                >
                                    {t.settings.apiKeys.actions.create}
                                </Button>
                            </div>

                            <div className="space-y-4">
                                <div className="divide-y divide-border/50">{renderKeyList()}</div>
                            </div>
                        </div>
                    </section>

                    <section id="settings-privacy" hidden={activeSection !== "privacy"} aria-labelledby="settings-privacy-title">
                        <h2 id="settings-privacy-title" className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-primary" />{t.settings.privacy.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t.settings.privacy.description}</p>

                        <div className="mt-5 divide-y divide-border/60">
                            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-medium">{t.settings.privacy.policy.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.privacy.policy.description}</p>
                                </div>
                                <Button variant="outline" asChild>
                                    <a href="https://hanami.yorunoken.com/legal/privacy" target="_blank" rel="noreferrer">
                                        {t.settings.privacy.policy.action}
                                        <ExternalLink className="ml-2 h-4 w-4" />
                                    </a>
                                </Button>
                            </div>

                            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="font-medium text-destructive">{t.settings.privacy.deletion.title}</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">{t.settings.privacy.deletion.description}</p>
                                </div>
                                <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive" asChild>
                                    <a href="https://hanami.yorunoken.com/legal/data-deletion#other">{t.settings.privacy.deletion.action}</a>
                                </Button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <Dialog open={dialogs.create} onOpenChange={(open) => setDialogs((prev) => ({ ...prev, create: open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t.settings.apiKeys.dialog.create.title}</DialogTitle>
                        <DialogDescription>
                            <div>{t.settings.apiKeys.dialog.create.description}</div>
                            <Alert variant="destructive" className="mt-4">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>{t.settings.apiKeys.dialog.create.warning.title}</AlertTitle>
                                <AlertDescription>
                                    <div>{t.settings.apiKeys.dialog.create.warning.description}</div>
                                </AlertDescription>
                            </Alert>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {operationError && (
                            <Alert variant="destructive" role="alert" className="mb-4">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>{operationError}</AlertTitle>
                            </Alert>
                        )}
                        <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder={t.settings.apiKeys.dialog.create.placeholder} className="w-full" />
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setDialogs((prev) => ({ ...prev, create: false }))}>
                            {t.settings.apiKeys.actions.close}
                        </Button>
                        <Button onClick={handleCreateKey} disabled={loading.creation || !newKeyName.trim()}>
                            {t.settings.apiKeys.actions.create}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!dialogs.delete} onOpenChange={(open) => !open && setDialogs((prev) => ({ ...prev, delete: null }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            {t.settings.apiKeys.dialog.delete.title}
                        </DialogTitle>
                        <DialogDescription>
                            <div>
                                <div className="mb-2">{t.settings.apiKeys.dialog.delete.description.replace("{name}", dialogs.delete?.name || "")}</div>
                                <div className="font-medium text-destructive">{t.settings.apiKeys.dialog.delete.warning}</div>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    {operationError && (
                        <Alert variant="destructive" role="alert">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{operationError}</AlertTitle>
                        </Alert>
                    )}
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setDialogs((prev) => ({ ...prev, delete: null }))}>
                            {t.settings.apiKeys.actions.close}
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteKey} disabled={loading.deletion}>
                            {t.settings.apiKeys.dialog.delete.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!dialogs.newKey} onOpenChange={handleCloseNewKeyDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t.settings.apiKeys.dialog.created.title}</DialogTitle>
                        <DialogDescription>
                            <div>
                                <Alert variant="destructive" className="mt-4">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>{t.settings.apiKeys.dialog.created.warning.title}</AlertTitle>
                                    <AlertDescription>
                                        <div>{t.settings.apiKeys.dialog.created.warning.description}</div>
                                    </AlertDescription>
                                </Alert>
                                <div className="mt-4">
                                    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2">
                                        <code className="font-mono text-sm flex-1 break-all px-2">{dialogs.newKey}</code>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => copyKey(dialogs.newKey)}
                                            className="flex-shrink-0"
                                            aria-label={copied ? t.settings.apiKeys.dialog.created.copied : t.settings.apiKeys.actions.copy}
                                        >
                                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                    {copyError && <p role="alert" className="mt-2 text-sm text-destructive">{copyError}</p>}
                                </div>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={handleCloseNewKeyDialog}>{t.settings.apiKeys.actions.close}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
