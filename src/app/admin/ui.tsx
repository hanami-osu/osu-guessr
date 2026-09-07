interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
    return (
        <details className="border-t border-border/60" open={defaultOpen}>
            <summary className="text-lg sm:text-xl font-semibold py-5 cursor-pointer hover:text-primary transition-colors">{title}</summary>
            <div className="pb-6 space-y-6">{children}</div>
        </details>
    );
}
