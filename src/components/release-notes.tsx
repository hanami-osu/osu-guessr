export function formatReleaseDate(date: string) {
    return new Date(date).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" });
}

// body_html is rendered and sanitized by GitHub, so it is safe to inject.
export function ReleaseNotes({ html }: { html: string }) {
    return (
        <div
            className="space-y-3 text-sm leading-6 text-foreground/85 [&_a]:text-primary hover:[&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:marker:text-primary"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
