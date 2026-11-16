import "server-only";

const RELEASES_URL = "https://api.github.com/repos/hanami-osu/osu-guessr/releases?per_page=30";

export interface Release {
    version: string;
    date: string;
    url: string;
    bodyHtml: string;
}

interface GitHubRelease {
    tag_name: string;
    name: string | null;
    // The date of the tagged commit, so backfilled releases keep their real date.
    created_at: string;
    html_url: string;
    body_html?: string | null;
    draft: boolean;
}

export async function readChangelogs(): Promise<Release[]> {
    try {
        const response = await fetch(RELEASES_URL, {
            // The html media type adds body_html, rendered and sanitized by GitHub.
            headers: { Accept: "application/vnd.github.html+json", "X-GitHub-Api-Version": "2022-11-28" },
            next: { revalidate: 3_600 },
            signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
            console.error(`Error fetching GitHub releases: ${response.status}`);
            return [];
        }

        const releases = (await response.json()) as GitHubRelease[];
        return releases
            .filter((release) => !release.draft)
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
            .map((release) => ({
                version: release.name || release.tag_name,
                date: release.created_at,
                url: release.html_url,
                bodyHtml: release.body_html ?? "",
            }));
    } catch (error) {
        console.error("Error fetching GitHub releases:", error);
        return [];
    }
}
