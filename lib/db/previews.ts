import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import {
  DEAL_PREVIEW_PUBLIC_SELECT,
  DEAL_PREVIEW_SITEMAP_PAGE_SIZE,
  DEAL_PREVIEW_SITEMAP_SELECT,
} from "@/lib/db/preview-columns";
import { throwIfQueryError } from "@/lib/db/errors";
import type { PublicDatabase } from "@/lib/db/public-schema";
import { paginationSchema, parseInput, slugSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";

export type PublicSupabaseClient = SupabaseClient<PublicDatabase>;

export type DealPreviewPublic = Pick<
  Database["public"]["Tables"]["deal_previews"]["Row"],
  | "deal_id"
  | "slug"
  | "preview_title"
  | "preview_summary"
  | "deal_type"
  | "buyer_sector"
  | "stage"
  | "status"
  | "main_category"
  | "broad_region"
  | "value_band"
  | "deadline_band"
  | "duration_band"
  | "sme_suitability"
  | "bid_complexity"
  | "competition_level"
  | "requirements_preview"
  | "relevance_tags"
  | "freshness_label"
  | "created_at"
  | "updated_at"
>;

export type DealPreviewSearchRow =
  Database["public"]["Functions"]["search_deal_previews"]["Returns"][number];

export type DealPreviewSitemapRow = Pick<
  Database["public"]["Tables"]["deal_previews"]["Row"],
  | "slug"
  | "preview_title"
  | "preview_summary"
  | "main_category"
  | "broad_region"
  | "value_band"
  | "deadline_band"
  | "status"
  | "updated_at"
>;

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
  status: z
    .enum([
      "UPCOMING",
      "OPEN",
      "CLOSING_SOON",
      "CLOSED",
      "AWARDED",
      "CANCELLED",
      "ACTIVE",
      "EXPIRED",
      "WITHDRAWN",
    ])
    .optional(),
  statuses: z
    .array(
      z.enum([
        "UPCOMING",
        "OPEN",
        "CLOSING_SOON",
        "CLOSED",
        "AWARDED",
        "CANCELLED",
        "ACTIVE",
        "EXPIRED",
        "WITHDRAWN",
      ]),
    )
    .min(1)
    .max(9)
    .optional(),
});

const previewSearchSchema = previewListSchema.extend({
  query: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const publishedPreviewFilter = {
  is_published: true,
  leakage_risk: "LOW",
} as const;

export async function listPublishedDealPreviews(
  client: PublicSupabaseClient,
  input: unknown = {},
): Promise<DealPreviewPublic[]> {
  const filters = parseInput(previewListSchema, input, "Published preview list");

  let query = client
    .from("deal_previews")
    .select(DEAL_PREVIEW_PUBLIC_SELECT)
    .eq("is_published", publishedPreviewFilter.is_published)
    .eq("leakage_risk", publishedPreviewFilter.leakage_risk)
    .order("updated_at", { ascending: false })
    .limit(filters.limit);

  if (filters.category) {
    query = query.eq("main_category", filters.category);
  }
  if (filters.buyerSector) {
    query = query.eq("buyer_sector", filters.buyerSector);
  }
  if (filters.dealType) {
    query = query.eq("deal_type", filters.dealType);
  }
  if (filters.region) {
    query = query.eq("broad_region", filters.region);
  }
  if (filters.statuses?.length) {
    query = query.in("status", filters.statuses);
  } else if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.valueBand) {
    query = query.eq("value_band", filters.valueBand);
  }
  if (filters.deadlineBand) {
    query = query.eq("deadline_band", filters.deadlineBand);
  }

  const { data, error } = await query;
  return throwIfQueryError("Failed to list published deal previews", {
    data: (data as unknown as DealPreviewPublic[]) ?? [],
    error,
  });
}

export async function getPublishedDealPreviewBySlug(
  client: PublicSupabaseClient,
  slug: string,
): Promise<DealPreviewPublic | null> {
  const parsedSlug = parseInput(slugSchema, slug, "Preview slug");
  const { data, error } = await client
    .from("deal_previews")
    .select(DEAL_PREVIEW_PUBLIC_SELECT)
    .eq("slug", parsedSlug)
    .eq("is_published", publishedPreviewFilter.is_published)
    .eq("leakage_risk", publishedPreviewFilter.leakage_risk)
    .maybeSingle();

  return throwIfQueryError("Failed to load published deal preview", {
    data: (data as unknown as DealPreviewPublic | null) ?? null,
    error,
  });
}

export async function getPublishedDealPreviewByDealId(
  client: PublicSupabaseClient,
  dealId: string,
): Promise<DealPreviewPublic | null> {
  const id = parseInput(uuidSchema, dealId, "Deal id");
  const { data, error } = await client
    .from("deal_previews")
    .select(DEAL_PREVIEW_PUBLIC_SELECT)
    .eq("deal_id", id)
    .eq("is_published", publishedPreviewFilter.is_published)
    .eq("leakage_risk", publishedPreviewFilter.leakage_risk)
    .maybeSingle();

  return throwIfQueryError("Failed to load published deal preview by id", {
    data: (data as unknown as DealPreviewPublic | null) ?? null,
    error,
  });
}

export async function searchPublishedDealPreviews(
  client: PublicSupabaseClient,
  input: unknown = {},
): Promise<DealPreviewSearchRow[]> {
  const filters = parseInput(previewSearchSchema, input, "Published preview search");
  const { data, error } = await client.rpc("search_deal_previews", {
    p_query: filters.query || undefined,
    p_category: filters.category,
    p_buyer_sector: filters.buyerSector,
    p_deal_type: filters.dealType,
    p_region: filters.region,
    p_status: filters.status,
    p_value_band: filters.valueBand,
    p_deadline_band: filters.deadlineBand,
    p_limit: filters.limit,
    p_offset: filters.offset,
  });

  return throwIfQueryError("Failed to search published deal previews", {
    data: data ?? [],
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
  const { count, error } = await client
    .from("deal_previews")
    .select("slug", { count: "exact", head: true })
    .eq("is_published", publishedPreviewFilter.is_published)
    .eq("leakage_risk", publishedPreviewFilter.leakage_risk);

  throwIfQueryError("Failed to count published deal previews for sitemap", {
    data: count ?? 0,
    error,
  });
  return count ?? 0;
}

export async function listPublishedDealPreviewSitemapRows(
  client: PublicSupabaseClient,
  input: unknown = {},
): Promise<DealPreviewSitemapRow[]> {
  const page = parseInput(sitemapPageSchema, input, "Preview sitemap page");
  const to = page.offset + page.limit - 1;
  const { data, error } = await client
    .from("deal_previews")
    .select(DEAL_PREVIEW_SITEMAP_SELECT)
    .eq("is_published", publishedPreviewFilter.is_published)
    .eq("leakage_risk", publishedPreviewFilter.leakage_risk)
    .order("updated_at", { ascending: false })
    .range(page.offset, to);

  return throwIfQueryError("Failed to list published deal previews for sitemap", {
    data: (data as unknown as DealPreviewSitemapRow[]) ?? [],
    error,
  });
}
