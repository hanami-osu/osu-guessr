"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LockInfo } from "@/lib/infra/lockdown";
import { adminGetLock, adminSetLock, adminUnlock } from "../actions/lockdown";
import { syncUserAchievements } from "../actions/update-outofsync-users";
import { AdminGroup, AdminSection, useAdminAction } from "../ui";

export default function MaintenanceSection() {
    const { pending, run } = useAdminAction();
    const [lock, setLock] = useState<LockInfo | null | undefined>(undefined);
    const [minutes, setMinutes] = useState("15");

    const loadLock = useCallback(async () => {
        const result = await run(async () => ({ info: await adminGetLock() }));
        if (result) setLock(result.info);
    }, [run]);

    useEffect(() => {
        void loadLock();
    }, [loadLock]);

    const lockServer = async () => {
        if (!confirm(`Lock the site for ${minutes} minute(s)? Only the owner will be able to use it.`)) return;
        const info = await run(() => adminSetLock(Number(minutes)), (result) => `Locked until ${new Date(result.until).toLocaleTimeString()}`);
        if (info) setLock(info);
    };

    const unlockServer = async () => {
        if (await run(adminUnlock, "Site unlocked")) setLock(null);
    };

    const syncStats = async () => {
        await run(async () => {
            await syncUserAchievements();
            return true;
        }, "Player stats rebuilt");
    };

    return (
        <AdminSection title="Maintenance" description="Site-wide switches and repair jobs.">
            <AdminGroup title="Lockdown" description="While locked, everyone except the owner sees a maintenance page.">
                <p className="mb-4 flex items-center gap-2 text-sm font-medium" role="status">
                    <span className={`size-2 rounded-full ${lock ? "bg-destructive" : lock === null ? "bg-success" : "bg-muted-foreground"}`} />
                    {lock === undefined ? "Checking..." : lock ? `Locked until ${new Date(lock.until).toLocaleString()}` : "Site is open"}
                </p>
                {lock ? (
                    <Button variant="outline" onClick={unlockServer} disabled={pending}>
                        Unlock now
                    </Button>
                ) : (
                    <div className="flex max-w-xs items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                            <Label htmlFor="lock-minutes">Minutes</Label>
                            <Input id="lock-minutes" type="number" min={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
                        </div>
                        <Button variant="destructive" onClick={lockServer} disabled={pending || lock === undefined || Number(minutes) < 1}>
                            Lock site
                        </Button>
                    </div>
                )}
            </AdminGroup>

            <AdminGroup title="Player stats" description="Rebuild every player's cached achievement and score totals from their games. Use after a backfill or if profile numbers look wrong.">
                <Button variant="outline" onClick={syncStats} disabled={pending}>
                    {pending ? "Working..." : "Rebuild player stats"}
                </Button>
            </AdminGroup>
        </AdminSection>
    );
}
