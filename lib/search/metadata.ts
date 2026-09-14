import type { Metadata } from "next";

import type { PublicDealPreview } from "@/lib/search/dto";
import { APP_NAME } from "@/lib/constants";

function clip(text: string, max: number) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function publicDealsIndexMetadata(hasFilters: boolean): Metadata {
  return {
    title: "Find deals",
    description:
      "Browse sanitised UK contract opportunities. Buyer identity and original sources stay locked until you subscribe.",
    robots: hasFilters
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title: `Find deals · ${APP_NAME}`,
      description:
        "Search anonymised public and private-sector opportunities without revealing who is buying.",
    },
  };
}

export function publicDealPreviewMetadata(
  preview: PublicDealPreview,
  canonicalUrl: string,
): Metadata {
  const description = clip(preview.previewSummary, 160);

  return {
    title: preview.previewTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: preview.previewTitle,
      description,
      url: canonicalUrl,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: preview.previewTitle,
      description,
    },
  };
}
