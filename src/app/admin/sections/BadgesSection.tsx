"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addBadge, assignBadgeToUser, getBadges, listBadges, removeBadge, removeBadgeFromUser, type UserBadge } from "../actions/manage-badges";
import { AdminGroup, AdminSection, EmptyRow, useAdminAction } from "../ui";

type BadgeType = Awaited<ReturnType<typeof getBadges>>[number];

function BadgeChip({ name, color }: { name: string; color: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2 py-0.5 text-xs font-medium">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
            {name}
        </span>
    );
}

export default function BadgesSection() {
    const { pending, run } = useAdminAction();
    const [types, setTypes] = useState<BadgeType[]>([]);
    const [assignments, setAssignments] = useState<UserBadge[] | null>(null);
    const [userId, setUserId] = useState("");
    const [badgeName, setBadgeName] = useState("");
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState("#8b5cf6");

    const load = useCallback(async () => {
        const [badgeTypes, userBadges] = (await run(() => Promise.all([getBadges(), listBadges()]))) ?? [[], []];
        setTypes(badgeTypes);
        setAssignments(userBadges);
    }, [run]);

    useEffect(() => {
        void load();
    }, [load]);

    const assign = async (event: React.FormEvent) => {
        event.preventDefault();
        if (await run(() => assignBadgeToUser(Number(userId), badgeName), (message) => message)) {
            setUserId("");
            await load();
        }
    };

    const unassign = async (assignment: UserBadge) => {
        if (!confirm(`Take "${assignment.badge_name}" away from ${assignment.username}?`)) return;
        if (await run(() => removeBadgeFromUser(assignment.user_id, assignment.badge_name), (message) => message)) {
            setAssignments((current) => current?.filter((row) => !(row.user_id === assignment.user_id && row.badge_name === assignment.badge_name)) ?? null);
        }
    };

    const createType = async (event: React.FormEvent) => {
        event.preventDefault();
        if (await run(() => addBadge(newName, newColor), (message) => message)) {
            setNewName("");
            await load();
        }
    };

    const deleteType = async (badge: BadgeType) => {
        const holders = assignments?.filter(({ badge_name }) => badge_name === badge.name).length ?? 0;
        if (!confirm(`Delete the "${badge.name}" badge?${holders ? ` ${holders} user(s) will lose it.` : ""}`)) return;
        if (await run(() => removeBadge(badge.name), (message) => message)) await load();
    };

    return (
        <AdminSection title="Badges" description="Badges shown on player profiles.">
            <AdminGroup title="Give a badge">
                <form onSubmit={assign} className="grid max-w-2xl gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-2">
                        <Label htmlFor="badge-user-id">osu! user ID</Label>
                        <Input id="badge-user-id" type="number" min={1} placeholder="123456" value={userId} onChange={(event) => setUserId(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="badge-type">Badge</Label>
                        <Select value={badgeName} onValueChange={setBadgeName}>
                            <SelectTrigger id="badge-type">
                                <SelectValue placeholder="Choose a badge" />
                            </SelectTrigger>
                            <SelectContent>
                                {types.map((badge) => (
                                    <SelectItem key={badge.name} value={badge.name}>
                                        {badge.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" disabled={pending || !userId || !badgeName}>
                        Give badge
                    </Button>
                </form>

                <ul className="mt-5 divide-y divide-border/60 border-y border-border/60">
                    {assignments === null ? (
                        <EmptyRow>Loading badge holders...</EmptyRow>
                    ) : assignments.length === 0 ? (
                        <EmptyRow>No one has a badge yet.</EmptyRow>
                    ) : (
                        assignments.map((assignment) => (
                            <li key={`${assignment.user_id}-${assignment.badge_name}`} className="flex items-center gap-4 py-2.5">
                                <Link href={`/user/${assignment.user_id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">
                                    {assignment.username} <span className="font-normal text-muted-foreground">{assignment.user_id}</span>
                                </Link>
                                <BadgeChip name={assignment.badge_name} color={assignment.color} />
                                <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:inline">{new Date(assignment.assigned_at).toLocaleDateString()}</span>
                                <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => unassign(assignment)} disabled={pending} aria-label={`Take ${assignment.badge_name} from ${assignment.username}`}>
                                    <X />
                                </Button>
                            </li>
                        ))
                    )}
                </ul>
            </AdminGroup>

            <AdminGroup title="Badge types">
                <form onSubmit={createType} className="flex max-w-md items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="badge-name">New badge</Label>
                        <Input id="badge-name" placeholder="Contributor" value={newName} onChange={(event) => setNewName(event.target.value)} />
                    </div>
                    <Input aria-label="Badge color" type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} className="h-9 w-12 shrink-0 p-1" />
                    <Button type="submit" disabled={pending || !newName.trim()}>
                        Create
                    </Button>
                </form>

                <ul className="mt-5 flex flex-wrap gap-2">
                    {types.length === 0 && <EmptyRow>No badge types yet.</EmptyRow>}
                    {types.map((badge) => (
                        <li key={badge.name} className="inline-flex items-center gap-1 rounded-full border border-border/60 py-0.5 pl-2.5 pr-1 text-xs font-medium">
                            <span className="size-2 rounded-full" style={{ backgroundColor: badge.color }} />
                            {badge.name}
                            <button type="button" onClick={() => deleteType(badge)} disabled={pending} className="ml-1 rounded-full p-1 text-muted-foreground hover:text-destructive disabled:opacity-50" aria-label={`Delete ${badge.name}`}>
                                <Trash2 className="size-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            </AdminGroup>
        </AdminSection>
    );
}
