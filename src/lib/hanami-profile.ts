export function getHanamiProfileUrl(baseUrl: string | undefined): string | null {
    if (!baseUrl) return null;
    try {
        const url = new URL(baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        url.pathname = "/profile";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return null;
    }
}
