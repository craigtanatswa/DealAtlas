import "server-only";

import {
  getPublishedDealPreviewBySlug,
  searchPublishedDealPreviews,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
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

export async function searchPublicDealPreviewsFromParams(
  client: PublicSupabaseClient,
  searchParams: SearchParamRecord,
): Promise<{ filters: PublicSearchFilters; result: PublicDealSearchResult }> {
  const filters = parsePublicSearchParams(searchParams);
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
