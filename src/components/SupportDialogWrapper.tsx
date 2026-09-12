"use client";

import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useTranslationsContext } from "@/context/translations-provider";
import Link from "next/link";

export function SupportPageLink() {
    const { t } = useTranslationsContext();

    return (
        <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10 hover:text-primary/80" asChild>
            <Link href="/support">
                <Heart className="h-5 w-5 mr-2" />
                <span className="inline">{t.common.support}</span>
            </Link>
        </Button>
    );
}
