import "server-only";

import {
  getPublishedDealPreviewByDealId,
  searchPublishedDealPreviews,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
import { throwIfQueryError } from "@/lib/db/errors";
import {
  loadCompanyProfileIdForUser,
  loadSafeMatchForDeal,
  loadSafeMatchesForDeals,
  toSafeMatchView,
} from "@/lib/matching/load";
import { parseStoredReasons } from "@/lib/matching/reasons";
import type { SafeMatchView } from "@/lib/matching/types";
import {
  toPublicDealPreview,
  type RankedDealSearchResult,
} from "@/lib/search/dto";
import {
  parseSignedInSearchParams,
  publicSearchOffset,
  type SearchParamRecord,
  type SignedInSearchFilters,
} from "@/lib/search/params";

type ProfileSearchRow = {
  deal_id: string;
  relevance_score: number | null;
  preview_reasons: unknown;
  total_count: number;
} & Parameters<typeof toPublicDealPreview>[0];

function usesRelevanceQuery(filters: SignedInSearchFilters): boolean {
  return filters.sort === "relevance" || filters.minScore != null;
}

function profileSearchArgs(
  companyProfileId: string,
  filters: SignedInSearchFilters,
  offset: number,
  limit = filters.limit,
) {
  return {
    p_company_profile_id: companyProfileId,
    p_query: filters.query || undefined,
    p_category: filters.category,
    p_buyer_sector: filters.buyerSector,
    p_deal_type: filters.dealType,
    p_region: filters.region,
    p_status: filters.status,
    p_value_band: filters.valueBand,
    p_deadline_band: filters.deadlineBand,
    p_min_score: filters.minScore,
    p_sort: filters.sort,
    p_limit: limit,
    p_offset: offset,
  };
}

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

  if (!companyProfileId || !usesRelevanceQuery(filters)) {
    const offset = publicSearchOffset(filters);
    const rows = await searchPublishedDealPreviews(input.client, {
      query: filters.query,
      category: filters.category,
      buyerSector: filters.buyerSector,
      region: filters.region,
      valueBand: filters.valueBand,
      deadlineBand: filters.deadlineBand,
      dealType: filters.dealType,
      status: filters.status,
      limit: filters.limit,
      offset,
    });
    let total = rows[0]?.total_count ?? 0;
    if (rows.length === 0 && offset > 0) {
      const countRows = await searchPublishedDealPreviews(input.client, {
        query: filters.query,
        category: filters.category,
        buyerSector: filters.buyerSector,
        region: filters.region,
        valueBand: filters.valueBand,
        deadlineBand: filters.deadlineBand,
        dealType: filters.dealType,
        status: filters.status,
        limit: 1,
        offset: 0,
      });
      total = countRows[0]?.total_count ?? 0;
    }
    const matches = companyProfileId
      ? await loadSafeMatchesForDeals({
          client: input.client,
          companyProfileId,
          dealIds: rows.map((row) => row.deal_id),
        })
      : new Map<string, SafeMatchView>();
    return {
      filters,
      companyProfileId,
      result: {
        items: rows.map((row) => ({
          preview: toPublicDealPreview(row),
          match: matches.get(row.deal_id) ?? null,
        })),
        total: Number(total),
        page: filters.page,
        pageSize: filters.limit,
      },
    };
  }

  const offset = publicSearchOffset(filters);
  const { data, error } = await input.client.rpc(
    "search_deal_previews_for_profile",
    profileSearchArgs(companyProfileId, filters, offset),
  );
  const rows = throwIfQueryError("Failed to search ranked deal previews", {
    data: (data as ProfileSearchRow[] | null) ?? [],
    error,
  });
  let total = rows[0]?.total_count ?? 0;
  if (rows.length === 0 && offset > 0) {
    const recount = await input.client.rpc(
      "search_deal_previews_for_profile",
      profileSearchArgs(companyProfileId, filters, 0, 1),
    );
    const countRows = throwIfQueryError("Failed to count ranked deal previews", {
      data: (recount.data as ProfileSearchRow[] | null) ?? [],
      error: recount.error,
    });
    total = countRows[0]?.total_count ?? 0;
  }

  return {
    filters,
    companyProfileId,
    result: {
      items: rows.map((row) => ({
        preview: toPublicDealPreview(row),
        match:
          row.relevance_score == null
            ? null
            : toSafeMatchView(Number(row.relevance_score), parseStoredReasons(row.preview_reasons)),
      })),
      total: Number(total),
      page: filters.page,
      pageSize: filters.limit,
    },
  };
}

export async function loadMatchForPreviewPage(input: {
  client: PublicSupabaseClient;
  userId: string | null;
  dealId: string;
}): Promise<SafeMatchView | null> {
  if (!input.userId) {
    return null;
  }
  const companyProfileId = await loadCompanyProfileIdForUser(input.client, input.userId);
  if (!companyProfileId) {
    return null;
  }
  return loadSafeMatchForDeal({
    client: input.client,
    companyProfileId,
    dealId: input.dealId,
  });
}

export async function publishedPreviewExists(
  client: PublicSupabaseClient,
  dealId: string,
): Promise<boolean> {
  const row = await getPublishedDealPreviewByDealId(client, dealId);
  return Boolean(row);
}
