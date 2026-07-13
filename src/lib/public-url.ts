const DEFAULT_PUBLIC_ORIGIN = "http://localhost:3000";

export function normalizePublicOrigin(value?: string): string {
    try {
        return new URL(value || DEFAULT_PUBLIC_ORIGIN).origin;
    } catch {
        return DEFAULT_PUBLIC_ORIGIN;
    }
}
