import type { Metadata } from "next";

import { APP_NAME } from "@/lib/constants";
import type { PublicIndexDecision } from "@/lib/seo/indexability";
import { publicCanonicalUrl } from "@/lib/seo/urls";

export const NOINDEX_ROBOTS = { index: false, follow: false } as const;

export const BRAND_OPENGRAPH_IMAGE = {
  url: "/brand/dealatlas-logo.png",
  alt: APP_NAME,
} as const;

export function robotsFromDecision(
  decision: PublicIndexDecision,
): NonNullable<Metadata["robots"]> {
  return { index: decision.index, follow: decision.follow };
}

export function marketingPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  origin: string;
  index?: boolean;
  absoluteTitle?: boolean;
}): Metadata {
  const canonical = publicCanonicalUrl(input.path, input.origin);
  const index = input.index ?? true;
  const openGraphTitle = input.absoluteTitle
    ? input.title
    : `${input.title} · ${APP_NAME}`;

  return {
    title: input.absoluteTitle
      ? { absolute: input.title }
      : input.title,
    description: input.description,
    alternates: {
      canonical,
    },
    robots: index ? { index: true, follow: true } : NOINDEX_ROBOTS,
    openGraph: {
      title: openGraphTitle,
      description: input.description,
      url: canonical,
      type: "website",
      locale: "en_GB",
      siteName: APP_NAME,
      images: [BRAND_OPENGRAPH_IMAGE],
    },
    twitter: {
      card: "summary",
      title: openGraphTitle,
      description: input.description,
      images: [BRAND_OPENGRAPH_IMAGE.url],
    },
  };
}
