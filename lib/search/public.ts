import "server-only";

import {
  getPublishedDealPreviewByDealId,
  getPublishedDealPreviewBySlug,
  listPublishedDealPreviewSitemapRows,
  countPublishedDealPreviewSitemapRows,
  resolvePublishedPreviewDealId,
  searchPublishedDealPreviews,
  type DealPreviewDtoRow,
  type DealPreviewSitemapRow,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
import { gatedRowMatch, resolveMatchAccess } from "@/lib/matching/entitlement";
import type { SafeMatchView } from "@/lib/matching/types";
import { DEAL_PREVIEW_SITEMAP_PAGE_SIZE } from "@/lib/db/preview-columns";
import {
  evaluatePublicIndexability,
  type PreviewIndexSignals,
} from "@/lib/seo/indexability";
import { absoluteUrl } from "@/lib/seo/urls";
import {
  toPublicDealPreview,
  type PublicDealPreview,
  type PublicDealSearchResult,
} from "@/lib/search/dto";
import {
  parsePublicSearchParams,
  publicSearchOffset,
  type PublicSearchFilters,
  type SearchParamRecord,
} from "@/lib/search/params";
import { parseInput, slugSchema } from "@/lib/validation";

export async function searchPublicDealPreviews(
  client: PublicSupabaseClient,
  input: PublicSearchFilters,
): Promise<PublicDealSearchResult> {
  const offset = publicSearchOffset(input);
  const rows = await searchPublishedDealPreviews(client, {
    query: input.query,
    category: input.category,
    buyerSector: input.buyerSector,
    region: input.region,
    valueBand: input.valueBand,
    deadlineBand: input.deadlineBand,
    dealType: input.dealType,
    status: input.status,
    sort: input.sort,
    limit: input.limit,
    offset,
  });

  let total = rows[0]?.total_count ?? 0;
  if (rows.length === 0 && offset > 0) {
    const countRows = await searchPublishedDealPreviews(client, {
      query: input.query,
      category: input.category,
      buyerSector: input.buyerSector,
      region: input.region,
      valueBand: input.valueBand,
      deadlineBand: input.deadlineBand,
      dealType: input.dealType,
      status: input.status,
      sort: input.sort,
      limit: 1,
      offset: 0,
    });
    total = countRows[0]?.total_count ?? 0;
  }

  return {
    items: rows.map(toPublicDealPreview),
    total: Number(total),
    page: input.page,
    pageSize: input.limit,
  };
}

export const HOME_LIVE_LIMIT = 6;

/** Closing soon, then open, then upcoming. Same RPC as /deals. */
export async function searchLiveHomePreviews(
  client: PublicSupabaseClient,
): Promise<PublicDealSearchResult> {
  const rows = await searchPublishedDealPreviews(client, {
    statuses: ["CLOSING_SOON", "OPEN", "UPCOMING"],
    sort: "biddable",
    limit: HOME_LIVE_LIMIT,
    offset: 0,
  });
  return {
    items: rows.map(toPublicDealPreview),
    total: Number(rows[0]?.total_count ?? 0),
    page: 1,
    pageSize: HOME_LIVE_LIMIT,
  };
}

export async function searchPublicDealPreviewsFromParams(
  client: PublicSupabaseClient,
  searchParams: SearchParamRecord,
): Promise<{ filters: PublicSearchFilters; result: PublicDealSearchResult }> {
  const parsed = parsePublicSearchParams(searchParams);
  // The public API never ranks by match: sort=relevance is profile-derived,
  // so it falls back to the default order for every caller.
  const filters: PublicSearchFilters =
    parsed.sort === "relevance" ? { ...parsed, sort: undefined } : parsed;
  const result = await searchPublicDealPreviews(client, filters);
  return { filters, result };
}

export async function getPublicDealPreviewBySlug(
  client: PublicSupabaseClient,
  slug: string,
): Promise<PublicDealPreview | null> {
  const parsedSlug = parseInput(slugSchema, slug, "Preview slug");
  const row = await getPublishedDealPreviewBySlug(client, parsedSlug);
  return row ? toPublicDealPreview(row) : null;
}

export type PublicDealPreviewPage = {
  preview: PublicDealPreview;
  /** Present only for signed-in viewers; anonymous payloads never carry it. */
  dealId: string | null;
  match: SafeMatchView | null;
};

/** Match data only through the Pro gate; null for free and anonymous viewers. */
async function viewerMatch(
  client: PublicSupabaseClient,
  userId: string | null | undefined,
  row: DealPreviewDtoRow,
): Promise<SafeMatchView | null> {
  if (!userId || row.relevance_score == null) {
    return null;
  }
  return gatedRowMatch(await resolveMatchAccess(client, userId), row);
}

export async function getPublicDealPreviewPageBySlug(
  client: PublicSupabaseClient,
  slug: string,
  options: { userId: string | null | undefined },
): Promise<PublicDealPreviewPage | null> {
  const parsedSlug = parseInput(slugSchema, slug, "Preview slug");
  const row = await getPublishedDealPreviewBySlug(client, parsedSlug);
  if (!row) {
    return null;
  }
  const dealId = options.userId
    ? await resolvePublishedPreviewDealId(client, parsedSlug)
    : null;
  return {
    preview: toPublicDealPreview(row),
    dealId,
    match: await viewerMatch(client, options.userId, row),
  };
}

export async function getPublicDealPreviewPageByDealId(
  client: PublicSupabaseClient,
  dealId: string,
  options: { userId: string | null | undefined },
): Promise<PublicDealPreviewPage | null> {
  const row = await getPublishedDealPreviewByDealId(client, dealId);
  if (!row) {
    return null;
  }
  return {
    preview: toPublicDealPreview(row),
    dealId,
    match: await viewerMatch(client, options.userId, row),
  };
}

function sitemapRowSignals(row: DealPreviewSitemapRow): PreviewIndexSignals {
  return {
    previewTitle: row.preview_title,
    previewSummary: row.preview_summary,
    mainCategory: row.main_category,
    broadRegion: row.broad_region,
    valueBand: row.value_band,
    deadlineBand: row.deadline_band,
    status: row.status,
  };
}

export async function countPublishedPreviewSitemapPages(
  client: PublicSupabaseClient,
): Promise<number> {
  const total = await countPublishedDealPreviewSitemapRows(client);
  return Math.max(1, Math.ceil(total / DEAL_PREVIEW_SITEMAP_PAGE_SIZE));
}

/** Published deal total for guide copy and sitemap-equivalent counts. Single source of truth. */
export async function countPublishedDealsForGuides(
  client: PublicSupabaseClient,
): Promise<number> {
  return countPublishedDealPreviewSitemapRows(client);
}

export type IndexablePreviewSitemapEntry = {
  slug: string;
  lastModified: string;
  url: string;
};

export async function listIndexablePreviewSitemapEntries(
  client: PublicSupabaseClient,
  origin: string,
  pageIndex: number,
): Promise<IndexablePreviewSitemapEntry[]> {
  const offset = pageIndex * DEAL_PREVIEW_SITEMAP_PAGE_SIZE;
  const rows = await listPublishedDealPreviewSitemapRows(client, {
    offset,
    limit: DEAL_PREVIEW_SITEMAP_PAGE_SIZE,
  });

  return rows
    .filter(
      (row) =>
        evaluatePublicIndexability({
          kind: "deal-preview",
          published: true,
          leakageRisk: "LOW",
          preview: sitemapRowSignals(row),
        }).index,
    )
    .map((row) => ({
      slug: row.slug,
      lastModified: row.last_modified,
      url: absoluteUrl(`/deals/${row.slug}`, origin),
    }));
}
