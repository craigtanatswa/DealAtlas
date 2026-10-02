import "server-only";

import {
  listPublishedDealPreviews,
  searchPublishedDealPreviews,
  type DealPreviewSearchRow,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
import { loadCompanyProfileIdForUser, toSafeMatchView } from "@/lib/matching/load";
import { parseStoredReasons } from "@/lib/matching/reasons";
import type { SafeMatchView } from "@/lib/matching/types";
import {
  toPublicDealPreview,
  type RankedDealSearchItem,
  type RankedDealSearchResult,
} from "@/lib/search/dto";
import {
  HOME_FALLBACK_STATUS,
  HOME_LATEST_LIMIT,
  HOME_PRIMARY_STATUSES,
  takeHomeLatestItems,
} from "@/lib/search/home-latest";
import {
  parseSignedInSearchParams,
  publicSearchOffset,
  type SearchParamRecord,
  type SignedInSearchFilters,
} from "@/lib/search/params";

function rowMatch(row: DealPreviewSearchRow): SafeMatchView | null {
  return row.relevance_score == null
    ? null
    : toSafeMatchView(Number(row.relevance_score), parseStoredReasons(row.preview_reasons));
}

function toRankedItem(row: DealPreviewSearchRow): RankedDealSearchItem {
  return { preview: toPublicDealPreview(row), match: rowMatch(row) };
}

export async function searchHomeLatestDealPreviews(input: {
  client: PublicSupabaseClient;
  userId?: string | null;
  limit?: number;
}): Promise<{
  companyProfileId: string | null;
  result: RankedDealSearchResult;
}> {
  const limit = input.limit ?? HOME_LATEST_LIMIT;
  const primaryRows = await listPublishedDealPreviews(input.client, {
    statuses: [...HOME_PRIMARY_STATUSES],
    limit,
  });
  const awardedRows =
    primaryRows.length < limit
      ? await listPublishedDealPreviews(input.client, {
          status: HOME_FALLBACK_STATUS,
          limit: limit - primaryRows.length,
        })
      : [];
  const rows = takeHomeLatestItems(primaryRows, awardedRows, (row) => row.slug, limit);
  const companyProfileId = input.userId
    ? await loadCompanyProfileIdForUser(input.client, input.userId)
    : null;

  return {
    companyProfileId,
    result: {
      items: rows.map(toRankedItem),
      total: rows.length,
      page: 1,
      pageSize: limit,
    },
  };
}

/**
 * Relevance scores come from the viewer's own company profile, resolved from
 * auth.uid() inside search_preview_dtos — never from a client-supplied id.
 */
export async function searchDealPreviewsForUser(input: {
  client: PublicSupabaseClient;
  searchParams: SearchParamRecord;
  userId?: string | null;
  defaultSort?: SignedInSearchFilters["sort"];
}): Promise<{
  filters: SignedInSearchFilters;
  result: RankedDealSearchResult;
  companyProfileId: string | null;
}> {
  const requested = parseSignedInSearchParams(input.searchParams, {
    defaultSort: input.defaultSort,
  });
  const companyProfileId = input.userId
    ? await loadCompanyProfileIdForUser(input.client, input.userId)
    : null;

  const filters: SignedInSearchFilters = {
    ...requested,
    sort: companyProfileId ? requested.sort : "updated",
    minScore: companyProfileId ? requested.minScore : undefined,
  };

  const offset = publicSearchOffset(filters);
  const searchArgs = {
    query: filters.query,
    category: filters.category,
    buyerSector: filters.buyerSector,
    region: filters.region,
    valueBand: filters.valueBand,
    deadlineBand: filters.deadlineBand,
    dealType: filters.dealType,
    status: filters.status,
    minScore: filters.minScore,
    sort: filters.sort,
  };
  const rows = await searchPublishedDealPreviews(input.client, {
    ...searchArgs,
    limit: filters.limit,
    offset,
  });
  let total = rows[0]?.total_count ?? 0;
  if (rows.length === 0 && offset > 0) {
    const countRows = await searchPublishedDealPreviews(input.client, {
      ...searchArgs,
      limit: 1,
      offset: 0,
    });
    total = countRows[0]?.total_count ?? 0;
  }

  return {
    filters,
    companyProfileId,
    result: {
      items: rows.map(toRankedItem),
      total: Number(total),
      page: filters.page,
      pageSize: filters.limit,
    },
  };
}
