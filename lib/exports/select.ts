import "server-only";

import { throwIfQueryError } from "@/lib/db/errors";
import {
  searchPublishedDealPreviews,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
import type { DealExportRequest } from "@/lib/exports/request";
import { loadCompanyProfileIdForUser } from "@/lib/matching/load";
import { PUBLIC_SEARCH_MAX_PAGE_SIZE } from "@/lib/search/params";
import type { SavedSearchFilters } from "@/lib/saves/filters";

const PREVIEW_PAGE_SIZE = PUBLIC_SEARCH_MAX_PAGE_SIZE;

type ProfileSearchRow = {
  deal_id: string;
  total_count: number;
};

function uniquePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

async function publishedDealIds(
  client: PublicSupabaseClient,
  dealIds: string[],
  remaining: number,
): Promise<string[]> {
  const unique = uniquePreserveOrder(dealIds).slice(0, remaining);
  if (unique.length === 0) {
    return [];
  }

  const published = new Set<string>();
  for (let index = 0; index < unique.length; index += 80) {
    const chunk = unique.slice(index, index + 80);
    const { data, error } = await client
      .from("deal_previews")
      .select("deal_id")
      .in("deal_id", chunk)
      .eq("is_published", true)
      .eq("leakage_risk", "LOW");
    const rows = throwIfQueryError("Failed to verify published deals for export", {
      data: (data as { deal_id: string }[] | null) ?? [],
      error,
    });
    for (const row of rows) {
      published.add(row.deal_id);
    }
  }

  return unique.filter((id) => published.has(id)).slice(0, remaining);
}

async function listSavedDealIds(
  client: PublicSupabaseClient,
  userId: string,
  remaining: number,
): Promise<string[]> {
  const { data, error } = await client
    .from("saved_deals")
    .select("deal_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(remaining);
  const rows = throwIfQueryError("Failed to list saved deals for export", {
    data: data ?? [],
    error,
  });
  return rows.map((row) => row.deal_id);
}

async function listFilteredDealIds(
  client: PublicSupabaseClient,
  userId: string,
  filters: SavedSearchFilters,
  remaining: number,
): Promise<string[]> {
  const companyProfileId = await loadCompanyProfileIdForUser(client, userId);
  const sort = companyProfileId ? (filters.sort ?? "updated") : "updated";
  const minScore = companyProfileId ? filters.minScore : undefined;
  const useRelevance = Boolean(companyProfileId) && (sort === "relevance" || minScore != null);

  const ids: string[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (ids.length < remaining && offset < total) {
    const limit = Math.min(PREVIEW_PAGE_SIZE, remaining - ids.length);
    if (useRelevance && companyProfileId) {
      const { data, error } = await client.rpc("search_deal_previews_for_profile", {
        p_company_profile_id: companyProfileId,
        p_query: filters.query || undefined,
        p_category: filters.category,
        p_buyer_sector: filters.buyerSector,
        p_deal_type: filters.dealType,
        p_region: filters.region,
        p_status: filters.status,
        p_value_band: filters.valueBand,
        p_deadline_band: filters.deadlineBand,
        p_min_score: minScore,
        p_sort: sort,
        p_limit: limit,
        p_offset: offset,
      });
      const rows = throwIfQueryError("Failed to search ranked deals for export", {
        data: (data as ProfileSearchRow[] | null) ?? [],
        error,
      });
      if (rows.length === 0) {
        break;
      }
      total = Number(rows[0]?.total_count ?? 0);
      for (const row of rows) {
        if (ids.length >= remaining) {
          break;
        }
        ids.push(row.deal_id);
      }
      offset += rows.length;
      if (rows.length < limit) {
        break;
      }
      continue;
    }

    const rows = await searchPublishedDealPreviews(client, {
      query: filters.query,
      category: filters.category,
      buyerSector: filters.buyerSector,
      region: filters.region,
      valueBand: filters.valueBand,
      deadlineBand: filters.deadlineBand,
      dealType: filters.dealType,
      status: filters.status,
      limit,
      offset,
    });
    if (rows.length === 0) {
      break;
    }
    total = Number(rows[0]?.total_count ?? 0);
    for (const row of rows) {
      if (ids.length >= remaining) {
        break;
      }
      ids.push(row.deal_id);
    }
    offset += rows.length;
    if (rows.length < limit) {
      break;
    }
  }

  return ids;
}

export async function resolveExportDealIds(input: {
  client: PublicSupabaseClient;
  userId: string;
  body: DealExportRequest;
  remaining: number;
}): Promise<string[]> {
  const remaining = Math.max(0, input.remaining);
  if (remaining <= 0) {
    return [];
  }

  if (input.body.dealIds) {
    return publishedDealIds(input.client, input.body.dealIds, remaining);
  }

  if (input.body.saved) {
    const savedIds = await listSavedDealIds(input.client, input.userId, remaining);
    return publishedDealIds(input.client, savedIds, remaining);
  }

  if (input.body.filters) {
    return listFilteredDealIds(
      input.client,
      input.userId,
      input.body.filters,
      remaining,
    );
  }

  return [];
}
