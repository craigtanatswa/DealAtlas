import "server-only";

import type { PublicSupabaseClient } from "@/lib/db/previews";
import { DEAL_PREVIEW_PUBLIC_SELECT } from "@/lib/db/preview-columns";
import { throwIfQueryError } from "@/lib/db/errors";
import type { DealPreviewPublic } from "@/lib/db/previews";
import { toPublicDealPreview } from "@/lib/search/dto";
import { parseSavedSearchFilters } from "@/lib/saves/filters";
import type { SavedDealView, SavedSearchView } from "@/lib/saves/types";

export type { SavedDealView, SavedSearchView } from "@/lib/saves/types";

export type DealSaveState = {
  saved: boolean;
  used: number;
};

export async function countSavedDeals(
  client: PublicSupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await client
    .from("saved_deals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  throwIfQueryError("Failed to count saved deals", {
    data: count ?? 0,
    error,
  });
  return count ?? 0;
}

export async function countSavedSearches(
  client: PublicSupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await client
    .from("saved_searches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  throwIfQueryError("Failed to count saved searches", {
    data: count ?? 0,
    error,
  });
  return count ?? 0;
}

export async function isDealSaved(
  client: PublicSupabaseClient,
  userId: string,
  dealId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("saved_deals")
    .select("id")
    .eq("user_id", userId)
    .eq("deal_id", dealId)
    .maybeSingle();
  throwIfQueryError("Failed to load saved deal", {
    data: data ?? true,
    error,
  });
  return Boolean(data);
}

export async function loadDealSaveState(
  client: PublicSupabaseClient,
  userId: string,
  dealId: string,
): Promise<DealSaveState> {
  const [saved, used] = await Promise.all([
    isDealSaved(client, userId, dealId),
    countSavedDeals(client, userId),
  ]);
  return { saved, used };
}

export async function listSavedDeals(
  client: PublicSupabaseClient,
  userId: string,
): Promise<SavedDealView[]> {
  const { data, error } = await client
    .from("saved_deals")
    .select("id, deal_id, notes, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = throwIfQueryError("Failed to list saved deals", {
    data: data ?? [],
    error,
  });
  if (rows.length === 0) {
    return [];
  }
  const dealIds = rows.map((row) => row.deal_id);
  const { data: previewData, error: previewError } = await client
    .from("deal_previews")
    .select(DEAL_PREVIEW_PUBLIC_SELECT)
    .in("deal_id", dealIds)
    .eq("is_published", true)
    .eq("leakage_risk", "LOW");
  const previews = throwIfQueryError("Failed to load saved deal previews", {
    data: (previewData as DealPreviewPublic[] | null) ?? [],
    error: previewError,
  });
  const previewByDeal = new Map(
    previews.map((row) => [row.deal_id, toPublicDealPreview(row)]),
  );
  return rows.map((row) => ({
    id: row.id,
    dealId: row.deal_id,
    createdAt: row.created_at,
    notes: row.notes,
    preview: previewByDeal.get(row.deal_id) ?? null,
  }));
}

export async function listSavedSearches(
  client: PublicSupabaseClient,
  userId: string,
): Promise<SavedSearchView[]> {
  const { data, error } = await client
    .from("saved_searches")
    .select("id, name, filters, alert_cadence, enabled, created_at, last_evaluated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = throwIfQueryError("Failed to list saved searches", {
    data: data ?? [],
    error,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    alertCadence:
      row.alert_cadence === "NONE" ||
      row.alert_cadence === "IMMEDIATE" ||
      row.alert_cadence === "DAILY" ||
      row.alert_cadence === "WEEKLY"
        ? row.alert_cadence
        : "WEEKLY",
    enabled: row.enabled,
    filters: parseSavedSearchFilters(row.filters),
    createdAt: row.created_at,
    lastEvaluatedAt: row.last_evaluated_at,
  }));
}
