import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
    );
}
