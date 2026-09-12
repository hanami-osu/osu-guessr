interface StatsCardProps {
    title: string;
    value: string;
    description: string;
    icon: React.ReactNode;
}

export function StatsCard({ title, value, description, icon }: StatsCardProps) {
    return (
        <div className="h-full p-4 sm:p-5">
            <div className="flex items-start gap-3">
                <div className="pt-1 text-muted-foreground">{icon}</div>
                <div className="min-w-0">
                    <h3 className="text-sm text-muted-foreground">{title}</h3>
                    <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums leading-tight text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
                </div>
            </div>
        </div>
    );
}
