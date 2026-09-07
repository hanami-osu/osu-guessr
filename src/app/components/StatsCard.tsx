interface StatsCardProps {
    title: string;
    value: string;
    description: string;
    icon: React.ReactNode;
}

export function StatsCard({ title, value, description, icon }: StatsCardProps) {
    return (
        <div className="py-4">
            <div className="flex items-start gap-3">
                <div className="pt-1 text-primary">{icon}</div>
                <div className="min-w-0">
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-2xl font-bold leading-tight text-primary">{value}</p>
                    <p className="text-sm text-foreground/70 mt-1">{description}</p>
                </div>
            </div>
        </div>
    );
}
