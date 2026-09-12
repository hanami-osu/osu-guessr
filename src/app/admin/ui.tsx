import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export function CollapsibleSection({ id, title, description, icon, children, defaultOpen = false }: CollapsibleSectionProps) {
    return (
        <section id={id} className="scroll-mt-24 border-b border-border/60">
            <details className="group" open={defaultOpen}>
                <summary className="list-none cursor-pointer py-6 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-start gap-4">
                        <div className="mt-0.5 text-primary [&>svg]:size-5">{icon}</div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-semibold leading-tight sm:text-xl">{title}</h2>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
                        </div>
                        <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                    </div>
                </summary>
                <div className="pb-8 sm:pl-9">{children}</div>
            </details>
        </section>
    );
}

interface AdminGroupProps {
    title: string;
    description?: string;
    children: React.ReactNode;
}

export function AdminGroup({ title, description, children }: AdminGroupProps) {
    return (
        <div className="border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
            <div className="mb-4">
                <h3 className="font-medium">{title}</h3>
                {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
            </div>
            {children}
        </div>
    );
}
