import { NextResponse } from "next/server";

import { isLegacyPublicSlug } from "@/lib/deals/public-slug";
import { resolveCategory } from "@/lib/matching/categories";
import { getCategoryLanding } from "@/lib/seo/category-landings";

export type SlugRedirectRow = {
  slug: string;
  dealId: string;
  isPublished: boolean;
  leakageRisk: string;
  unpublishedByAdmin: boolean;
  mainCategory: string | null;
  submissionDeadline: string | null;
  dealStatus: string | null;
};

const EXPIRED_STATUSES = new Set([
  "CLOSED",
  "AWARDED",
  "CANCELLED",
  "EXPIRED",
  "WITHDRAWN",
]);

export function isSafePublicSlug(slug: string): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    slug.length <= 80 &&
    !/\d{8,}/.test(slug)
  );
}

export function isPubliclyViewable(row: SlugRedirectRow): boolean {
  return (
    row.isPublished &&
    !row.unpublishedByAdmin &&
    row.leakageRisk === "LOW" &&
    !isLegacyPublicSlug(row.slug, row.dealId) &&
    isSafePublicSlug(row.slug)
  );
}

export function isExpiredRow(row: SlugRedirectRow, now: Date): boolean {
  if (row.isPublished || row.unpublishedByAdmin || row.leakageRisk !== "LOW") {
    return false;
  }
  const deadlinePassed =
    row.submissionDeadline !== null &&
    Date.parse(row.submissionDeadline) < now.getTime();
  return (
    deadlinePassed ||
    (row.dealStatus !== null && EXPIRED_STATUSES.has(row.dealStatus))
  );
}

export function categoryFallbackPath(mainCategory: string | null): string {
  const category = resolveCategory(mainCategory);
  if (!category) {
    return "/deals";
  }
  return getCategoryLanding(category.slug)?.path ?? "/deals";
}

export function resolveDealSlugRedirect(input: {
  requested: SlugRedirectRow | null;
  retired: boolean;
  aliasTarget: SlugRedirectRow | null;
  now: Date;
}): string | null {
  const { requested, retired, aliasTarget, now } = input;

  if (requested) {
    if (isPubliclyViewable(requested)) {
      return null;
    }
    if (isLegacyPublicSlug(requested.slug, requested.dealId)) {
      return null;
    }
    if (isExpiredRow(requested, now)) {
      return categoryFallbackPath(requested.mainCategory);
    }
    return null;
  }

  if (retired && aliasTarget) {
    if (isPubliclyViewable(aliasTarget)) {
      return `/deals/${aliasTarget.slug}`;
    }
    if (isExpiredRow(aliasTarget, now)) {
      return categoryFallbackPath(aliasTarget.mainCategory);
    }
    return null;
  }

  return null;
}

export function buildRedirectLocation(targetPath: string, requestUrl: URL): URL {
  const location = new URL(targetPath, requestUrl.origin);
  let copied = 0;
  for (const [name, value] of requestUrl.searchParams) {
    if (copied >= 5) {
      break;
    }
    if (!/^utm_[a-z]+$/.test(name) || value.length > 200) {
      continue;
    }
    location.searchParams.set(name, value);
    copied += 1;
  }
  return location;
}

export function slugRedirectResponse(location: URL): NextResponse {
  return new NextResponse(null, {
    status: 301,
    headers: {
      location: location.toString(),
      "cache-control": "no-store",
    },
  });
}
