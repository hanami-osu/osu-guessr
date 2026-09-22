import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GameActionButtonProps = Omit<ComponentProps<typeof Button>, "size" | "variant" | "asChild"> & {
    intent?: "primary" | "skip" | "exit";
    loadingLabel?: string;
};

export default function GameActionButton({ intent = "primary", loadingLabel, disabled, className, children, ...props }: GameActionButtonProps) {
    return (
        <Button
            type="button"
            {...props}
            variant={intent === "primary" ? "default" : "ghost"}
            disabled={disabled || Boolean(loadingLabel)}
            aria-busy={Boolean(loadingLabel)}
            className={cn(
                "h-auto min-h-11 min-w-0 whitespace-normal py-2 lg:min-h-12 lg:text-base",
                intent === "skip" && "border border-warning/40 bg-warning/[0.04] text-warning hover:border-warning/60 hover:bg-warning/10 hover:text-warning",
                className,
            )}
        >
            {loadingLabel ? (
                <>
                    <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    <span role="status">{loadingLabel}</span>
                </>
            ) : (
                children
            )}
        </Button>
    );
}
