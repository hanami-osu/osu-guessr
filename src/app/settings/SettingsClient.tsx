"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, deleteApiKeyAction, ApiKey, listApiKeysAction } from "@/actions/api-keys-server";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, AlertCircle, Loader2, Check, Copy } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { useTranslationsContext } from "@/context/translations-provider";

export default function SettingsClient() {
    const { t } = useTranslationsContext();

    const [apiKeys, setApiKeys] = useState<Array<ApiKey>>([]);
    const [loading, setLoading] = useState({
        keys: true,
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
    const [keyLoadError, setKeyLoadError] = useState<string | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [copyError, setCopyError] = useState<string | null>(null);

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

    useEffect(() => {
        loadApiKeys();
    }, [loadApiKeys]);

    // Key management functions
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

    // Dialog management
    function handleCloseNewKeyDialog() {
        if (!copied) {
            const confirmed = window.confirm(t.settings.apiKeys.dialog.created.warning.description);
            if (!confirmed) return;
        }
        setDialogs((prev) => ({ ...prev, newKey: null }));
    }

    // Render helper functions
    function renderKeyList() {
        if (loading.keys) {
            return (
                <div className="py-8 flex justify-center items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-foreground/70" />
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
            return <p className="text-center py-4 text-foreground/70">{t.settings.apiKeys.keyInfo.noKeys}</p>;
        }

        return apiKeys.map((key) => (
            <div key={key.id} className="py-4 space-y-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="font-medium">{key.name}</p>
                        <p className="text-sm text-foreground/70">{t.settings.apiKeys.keyInfo.created.replace("{date}", new Date(key.created_at).toLocaleDateString())}</p>
                        {key.last_used ? (
                            <p className="text-sm text-foreground/70">{t.settings.apiKeys.keyInfo.lastUsed.replace("{date}", new Date(key.last_used).toLocaleDateString())}</p>
                        ) : (
                            <p className="text-sm text-foreground/70">{t.settings.apiKeys.keyInfo.neverUsed}</p>
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
        <div className="container mx-auto px-4 py-10 md:py-16">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl md:text-4xl font-bold mb-8">{t.settings.title}</h1>

                <section className="bg-card rounded-lg p-5 sm:p-8 border border-border/60">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
                        <h2 className="text-2xl font-bold">{t.settings.apiKeys.title}</h2>
                        <div className="text-sm text-foreground/70">{t.settings.apiKeys.usage.replace("{count}", apiKeys.length.toString())}</div>
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
                                className="w-full sm:w-auto"
                            >
                                {t.settings.apiKeys.actions.create}
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">{t.settings.apiKeys.title}</h3>
                            <div className="divide-y divide-border/50">{renderKeyList()}</div>
                        </div>
                    </div>
                </section>
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
                                    <div className="flex items-center gap-2 p-2 bg-background rounded border border-border/50">
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
        </div>
    );
}
