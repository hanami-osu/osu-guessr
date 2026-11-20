interface StatsCardProps {
    title: string;
    value: string;
    description?: string;
}

export function StatsCard({ title, value, description }: StatsCardProps) {
    return (
        <div className="h-full p-4 sm:p-5">
            <h3 className="text-sm text-muted-foreground">{title}</h3>
            <p className="font-display mt-1 text-2xl font-semibold leading-tight tracking-tight tabular-nums text-foreground">{value}</p>
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
    );
}
