import "server-only";

import { throwIfQueryError } from "@/lib/db/errors";
import type { PublicSupabaseClient } from "@/lib/db/previews";
import type { DealExportRequest } from "@/lib/exports/request";
import { loadCompanyProfileIdForUser } from "@/lib/matching/load";
import { PUBLIC_SEARCH_MAX_PAGE_SIZE } from "@/lib/search/params";
import type { SavedSearchFilters } from "@/lib/saves/filters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PREVIEW_PAGE_SIZE = PUBLIC_SEARCH_MAX_PAGE_SIZE;

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type DealIdSearchRow = {
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
  admin: AdminClient,
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
    const { data, error } = await admin
      .from("deal_previews")
      .select("deal_id")
      .in("deal_id", chunk)
      .eq("is_published", true)
      .eq("leakage_risk", "LOW")
      .eq("unpublished_by_admin", false);
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
  admin: AdminClient,
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
      const { data, error } = await admin.rpc("search_deal_previews_for_profile", {
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
        data: (data as DealIdSearchRow[] | null) ?? [],
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

    const { data, error } = await admin.rpc("search_deal_previews", {
      p_query: filters.query || undefined,
      p_category: filters.category,
      p_buyer_sector: filters.buyerSector,
      p_deal_type: filters.dealType,
      p_region: filters.region,
      p_status: filters.status,
      p_value_band: filters.valueBand,
      p_deadline_band: filters.deadlineBand,
      p_limit: limit,
      p_offset: offset,
    });
    const rows = throwIfQueryError("Failed to search deals for export", {
      data: (data as DealIdSearchRow[] | null) ?? [],
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
  }

  return ids;
}

/**
 * Callers must have verified Pro entitlement server-side: deal ids are resolved
 * with the admin client because client roles cannot read deal_previews rows.
 * Saved deals and the company profile still come from the user's RLS session.
 */
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

  const admin = createSupabaseAdminClient();

  if (input.body.dealIds) {
    return publishedDealIds(admin, input.body.dealIds, remaining);
  }

  if (input.body.saved) {
    const savedIds = await listSavedDealIds(input.client, input.userId, remaining);
    return publishedDealIds(admin, savedIds, remaining);
  }

  if (input.body.filters) {
    return listFilteredDealIds(
      input.client,
      admin,
      input.userId,
      input.body.filters,
      remaining,
    );
  }

  return [];
}
