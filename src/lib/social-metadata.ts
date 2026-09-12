import type { Metadata } from "next";

const DEFAULT_SOCIAL_IMAGE = "/main_bg.webp";

interface PageMetadataOptions {
    title: string;
    description: string;
    path: string;
    image?: string;
    imageAlt?: string;
    imageWidth?: number;
    imageHeight?: number;
    largeImage?: boolean;
}

export function createPageMetadata({
    title,
    description,
    path,
    image = DEFAULT_SOCIAL_IMAGE,
    imageAlt = "osu!guessr",
    imageWidth,
    imageHeight,
    largeImage,
}: PageMetadataOptions): Metadata {
    const socialTitle = title === "osu!guessr" ? title : `${title} | osu!guessr`;
    const usesDefaultImage = image === DEFAULT_SOCIAL_IMAGE;
    const width = imageWidth ?? (usesDefaultImage ? 1200 : undefined);
    const height = imageHeight ?? (usesDefaultImage ? 630 : undefined);
    const openGraphImage = {
        url: image,
        alt: imageAlt,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
    };

    return {
        title,
        description,
        alternates: {
            canonical: path,
        },
        openGraph: {
            title: socialTitle,
            description,
            url: path,
            siteName: "osu!guessr",
            type: "website",
            images: [openGraphImage],
        },
        twitter: {
            card: largeImage ?? usesDefaultImage ? "summary_large_image" : "summary",
            title: socialTitle,
            description,
            images: [{ url: image, alt: imageAlt }],
        },
    };
}
