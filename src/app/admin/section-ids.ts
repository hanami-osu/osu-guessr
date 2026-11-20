export const ADMIN_SECTION_IDS = ["mapsets", "skins", "daily", "announcements", "reports", "badges", "admins", "translations", "maintenance"] as const;

export type AdminSectionId = (typeof ADMIN_SECTION_IDS)[number];

export function toAdminSectionId(value: string | undefined): AdminSectionId {
    return ADMIN_SECTION_IDS.find((id) => id === value) ?? "mapsets";
}
