"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Textarea } from "./ui/textarea";
import { ReportType, createReportAction } from "@/actions/reports-server";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslationsContext } from "@/context/translations-provider";

interface ReportDialogProps {
    mapsetId: number;
    mapsetTitle: string;
    onOpenChange?: (open: boolean) => void;
}

const REPORT_TYPES = [
    { value: "incorrect_title", labelKey: "incorrectTitle" },
    { value: "inappropriate_content", labelKey: "inappropriateContent" },
    { value: "wrong_audio", labelKey: "wrongAudio" },
    { value: "wrong_background", labelKey: "wrongBackground" },
    { value: "other", labelKey: "other" },
] as const;

export function ReportDialog({ mapsetId, mapsetTitle, onOpenChange }: ReportDialogProps) {
    const { t } = useTranslationsContext();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reportType, setReportType] = useState<ReportType>("incorrect_title");
    const [description, setDescription] = useState("");
    const { toast } = useToast();

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        onOpenChange?.(open);
    };

    const handleSubmit = async () => {
        const normalizedDescription = description.trim();
        if (normalizedDescription.length < 10) {
            toast({ description: t.components.report.dialog.messages.validation });
            return;
        }

        setIsSubmitting(true);
        try {
            await createReportAction(mapsetId, reportType, normalizedDescription);
            toast({ description: t.components.report.dialog.messages.success });
            handleOpenChange(false);
            setDescription("");
        } catch {
            toast({ description: t.components.report.dialog.messages.error });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {t.components.report.button}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t.components.report.dialog.title}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-muted-foreground mb-2">{t.components.report.dialog.reportingFor.replace("{title}", mapsetTitle)}</p>
                    </div>

                    <div className="space-y-2">
                        <Label>{t.components.report.dialog.types.title}</Label>
                        <RadioGroup value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
                            {REPORT_TYPES.map((type) => (
                                <div key={type.value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={type.value} id={type.value} />
                                    <Label htmlFor={type.value}>{t.components.report.dialog.types[type.labelKey]}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="report-description">{t.components.report.dialog.description.label}</Label>
                        <Textarea id="report-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.components.report.dialog.description.placeholder} className="h-32" />
                        <p className="text-xs text-muted-foreground">{t.components.report.dialog.description.minLength}</p>
                    </div>

                    <div className="flex justify-end gap-4">
                        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                            {t.components.report.dialog.actions.cancel}
                        </Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting || description.trim().length < 10}>
                            {isSubmitting ? t.components.report.dialog.actions.submitting : t.components.report.dialog.actions.submit}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
