"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LeaveGameDialogProps {
    open: boolean;
    onOpenChange(open: boolean): void;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm(): void;
    disabled?: boolean;
}

export function LeaveGameDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, disabled = false }: LeaveGameDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={disabled}>{cancelLabel}</Button>
                    <Button type="button" onClick={onConfirm} disabled={disabled}>{confirmLabel}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
