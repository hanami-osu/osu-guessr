"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listAdmins, setAdmin, type AdminUser } from "../actions/admins";
import { AdminGroup, AdminSection, EmptyRow, useAdminAction } from "../ui";

export default function AdminsSection() {
    const { pending, run } = useAdminAction();
    const [admins, setAdmins] = useState<AdminUser[] | null>(null);
    const [userId, setUserId] = useState("");

    const load = useCallback(async () => setAdmins((await run(listAdmins)) ?? []), [run]);

    useEffect(() => {
        void load();
    }, [load]);

    const grant = async (event: React.FormEvent) => {
        event.preventDefault();
        if (await run(() => setAdmin(Number(userId), true), (message) => message)) {
            setUserId("");
            await load();
        }
    };

    const revoke = async (admin: AdminUser) => {
        if (!confirm(`Remove admin access from ${admin.username}?`)) return;
        if (await run(() => setAdmin(admin.banchoId, false), (message) => message)) await load();
    };

    return (
        <AdminSection title="Admins" description="Admins can use this panel and the analytics page. The owner can't be removed.">
            <AdminGroup title="Grant access" description="The user must have signed in to osu!guessr at least once.">
                <form onSubmit={grant} className="flex max-w-md items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="admin-user-id">osu! user ID</Label>
                        <Input id="admin-user-id" type="number" min={1} placeholder="123456" value={userId} onChange={(event) => setUserId(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={pending || !userId}>
                        Make admin
                    </Button>
                </form>
            </AdminGroup>

            <AdminGroup title={`Current admins${admins ? ` (${admins.length})` : ""}`}>
                <ul className="divide-y divide-border/60 border-y border-border/60">
                    {admins === null ? (
                        <EmptyRow>Loading admins...</EmptyRow>
                    ) : (
                        admins.map((admin) => (
                            <li key={admin.banchoId} className="flex items-center gap-4 py-2.5">
                                <Link href={`/user/${admin.banchoId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">
                                    {admin.username} <span className="font-normal text-muted-foreground">{admin.banchoId}</span>
                                </Link>
                                {admin.isOwner ? (
                                    <span className="text-xs font-medium text-muted-foreground">Owner</span>
                                ) : (
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => revoke(admin)} disabled={pending}>
                                        Remove
                                    </Button>
                                )}
                            </li>
                        ))
                    )}
                </ul>
            </AdminGroup>
        </AdminSection>
    );
}
