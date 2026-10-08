import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { DEAL_PREVIEW_SITEMAP_PAGE_SIZE } from "@/lib/db/preview-columns";
import { throwIfQueryError } from "@/lib/db/errors";
import type { PublicDatabase } from "@/lib/db/public-schema";
import { paginationSchema, parseInput, slugSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";

export type PublicSupabaseClient = SupabaseClient<PublicDatabase>;

type PublicFunctions = Database["public"]["Functions"];
type PreviewTableRow = Database["public"]["Tables"]["deal_previews"]["Row"];

/**
 * Generated RPC return types mark every RETURNS TABLE column non-null. Columns
 * copied from deal_previews keep the table's nullability, and the viewer's
 * relevance is null without a match.
 */
type WithPreviewNullability<T> = {
  [K in keyof T]: K extends "relevance_score" | "preview_reasons"
    ? T[K] | null
    : K extends keyof PreviewTableRow
      ? null extends PreviewTableRow[K]
        ? T[K] | null
        : T[K]
      : T[K];
};

/**
 * Sanitised preview DTO returned by the SECURITY DEFINER preview RPCs (0018).
 * It carries no deal_id, timestamps, source, buyer, reference or contact
 * fields; relevance is the signed-in viewer's own match, or null.
 */
export type DealPreviewDtoRow = WithPreviewNullability<
  PublicFunctions["get_preview_dto_by_slug"]["Returns"][number]
>;

export type DealPreviewSearchRow = WithPreviewNullability<
  PublicFunctions["search_preview_dtos"]["Returns"][number]
>;

export type DealPreviewSitemapRow = WithPreviewNullability<
  PublicFunctions["list_preview_sitemap_entries"]["Returns"][number]
>;

const DEAL_STATUS_VALUES = [
  "UPCOMING",
  "OPEN",
  "CLOSING_SOON",
  "CLOSED",
  "AWARDED",
  "CANCELLED",
  "ACTIVE",
  "EXPIRED",
  "WITHDRAWN",
  "UNCLASSIFIED",
] as const;

const previewListSchema = paginationSchema.extend({
  category: z.string().trim().min(1).max(200).optional(),
  buyerSector: z.enum([
    "PUBLIC",
    "PRIVATE",
    "NONPROFIT",
    "UTILITY",
    "EDUCATION",
    "HEALTHCARE",
    "OTHER",
  ]).optional(),
  dealType: z
    .enum([
      "PUBLIC_TENDER",
      "PRIVATE_TENDER",
      "RFP",
      "RFQ",
      "RFI",
      "EOI",
      "SUPPLY_CHAIN_OPPORTUNITY",
      "SUBCONTRACT_OPPORTUNITY",
      "FRAMEWORK",
      "DYNAMIC_MARKET",
      "PROCUREMENT_PIPELINE",
      "SUPPLIER_SEARCH",
      "EARLY_MARKET_ENGAGEMENT",
      "CONTRACT_RENEWAL",
      "AWARD",
    ])
    .optional(),
  region: z.string().trim().min(1).max(200).optional(),
  valueBand: z.string().trim().min(1).max(80).optional(),
  deadlineBand: z.string().trim().min(1).max(80).optional(),
  status: z.enum(DEAL_STATUS_VALUES).optional(),
  statuses: z.array(z.enum(DEAL_STATUS_VALUES)).min(1).max(DEAL_STATUS_VALUES.length).optional(),
});

const previewSearchSchema = previewListSchema.extend({
  query: z.string().trim().max(200).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(["updated", "relevance"]).default("updated"),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function searchPublishedDealPreviews(
  client: PublicSupabaseClient,
  input: unknown = {},
): Promise<DealPreviewSearchRow[]> {
  const filters = parseInput(previewSearchSchema, input, "Published preview search");
  const { data, error } = await client.rpc("search_preview_dtos", {
    p_query: filters.query || undefined,
    p_category: filters.category,
    p_buyer_sector: filters.buyerSector,
    p_deal_type: filters.dealType,
    p_region: filters.region,
    p_status: filters.statuses?.length ? undefined : filters.status,
    p_statuses: filters.statuses,
    p_value_band: filters.valueBand,
    p_deadline_band: filters.deadlineBand,
    p_min_score: filters.minScore,
    p_sort: filters.sort,
    p_limit: filters.limit,
    p_offset: filters.offset,
  });

  return throwIfQueryError("Failed to search published deal previews", {
    data: data ?? [],
    error,
  });
}

export async function listPublishedDealPreviews(
  client: PublicSupabaseClient,
  input: unknown = {},
): Promise<DealPreviewSearchRow[]> {
  const filters = parseInput(previewListSchema, input, "Published preview list");
  return searchPublishedDealPreviews(client, { ...filters, sort: "updated", offset: 0 });
}

export async function getPublishedDealPreviewBySlug(
  client: PublicSupabaseClient,
  slug: string,
): Promise<DealPreviewDtoRow | null> {
  const parsedSlug = parseInput(slugSchema, slug, "Preview slug");
  const { data, error } = await client.rpc("get_preview_dto_by_slug", {
    p_slug: parsedSlug,
  });

  return throwIfQueryError("Failed to load published deal preview", {
    data: data?.[0] ?? null,
    error,
  });
}

/** Signed-in only: the RPC returns nothing without auth.uid(). */
export async function getPublishedDealPreviewByDealId(
  client: PublicSupabaseClient,
  dealId: string,
): Promise<DealPreviewDtoRow | null> {
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await client.rpc("get_preview_dto_by_deal_id", {
    p_deal_id: id,
  });

  return throwIfQueryError("Failed to load published deal preview by id", {
    data: data?.[0] ?? null,
    error,
  });
}

/**
 * Signed-in only: resolves the internal deal id behind a published slug so
 * save/reveal controls can be rendered. Never call this for anonymous viewers.
 */
export async function resolvePublishedPreviewDealId(
  client: PublicSupabaseClient,
  slug: string,
): Promise<string | null> {
  const parsedSlug = parseInput(slugSchema, slug, "Preview slug");
  const { data, error } = await client.rpc("resolve_preview_deal_id", {
    p_slug: parsedSlug,
  });

  return throwIfQueryError("Failed to resolve published deal preview", {
    data: typeof data === "string" ? data : null,
    error,
  });
}

const sitemapPageSchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DEAL_PREVIEW_SITEMAP_PAGE_SIZE)
    .default(DEAL_PREVIEW_SITEMAP_PAGE_SIZE),
});

export async function countPublishedDealPreviewSitemapRows(
  client: PublicSupabaseClient,
): Promise<number> {
  const { data, error } = await client.rpc("count_preview_sitemap_entries");
  return Number(
    throwIfQueryError("Failed to count published deal previews for sitemap", {
      data: data ?? 0,
      error,
    }),
  );
}

export async function listPublishedDealPreviewSitemapRows(
  client: PublicSupabaseClient,
  input: unknown = {},
): Promise<DealPreviewSitemapRow[]> {
  const page = parseInput(sitemapPageSchema, input, "Preview sitemap page");
  const { data, error } = await client.rpc("list_preview_sitemap_entries", {
    p_limit: page.limit,
    p_offset: page.offset,
  });

  return throwIfQueryError("Failed to list published deal previews for sitemap", {
    data: data ?? [],
    error,
  });
}
