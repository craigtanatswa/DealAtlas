import type { Metadata } from "next";

import { APP_NAME } from "@/lib/constants";
import type { PublicDealPreview } from "@/lib/search/dto";
import {
  evaluatePublicIndexability,
  signalsFromPublicPreview,
} from "@/lib/seo/indexability";
import { robotsFromDecision } from "@/lib/seo/metadata";
import { PUBLIC_PAGE_COPY } from "@/lib/seo/pages";

function clip(text: string, max: number) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function publicDealsIndexMetadata(input: {
  hasFilters: boolean;
  page?: number;
  canonicalUrl: string;
}): Metadata {
  const decision = evaluatePublicIndexability({
    kind: "search",
    hasSearchFilters: input.hasFilters,
    searchPage: input.page ?? 1,
  });
  const description = PUBLIC_PAGE_COPY.deals.description;

  return {
    title: PUBLIC_PAGE_COPY.deals.title,
    description,
    alternates: {
      canonical: input.canonicalUrl,
    },
    robots: robotsFromDecision(decision),
    openGraph: {
      title: `${PUBLIC_PAGE_COPY.deals.title} · ${APP_NAME}`,
      description,
      url: input.canonicalUrl,
      type: "website",
      locale: "en_GB",
      siteName: APP_NAME,
    },
    twitter: {
      card: "summary",
      title: `${PUBLIC_PAGE_COPY.deals.title} · ${APP_NAME}`,
      description,
    },
  };
}

export function publicDealPreviewMetadata(
  preview: PublicDealPreview,
  canonicalUrl: string,
): Metadata {
  const description = clip(preview.previewSummary, 160);
  const decision = evaluatePublicIndexability({
    kind: "deal-preview",
    published: true,
    leakageRisk: "LOW",
    preview: signalsFromPublicPreview(preview),
  });

  return {
    title: preview.previewTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: robotsFromDecision(decision),
    openGraph: {
      title: preview.previewTitle,
      description,
      url: canonicalUrl,
      type: "article",
      locale: "en_GB",
      siteName: APP_NAME,
    },
    twitter: {
      card: "summary",
      title: preview.previewTitle,
      description,
    },
  };
}

export function missingPublicDealPreviewMetadata(): Metadata {
  return {
    title: "Opportunity not found",
    robots: { index: false, follow: false },
  };
}
