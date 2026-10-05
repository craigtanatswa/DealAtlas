/**
 * Explicit deal_previews columns for trusted server-side (admin client) reads.
 * Client roles have no table access; they use the preview DTO RPCs instead.
 * Never select every column in deal code.
 */
export const DEAL_PREVIEW_PUBLIC_COLUMNS = [
  "deal_id",
  "slug",
  "preview_title",
  "preview_summary",
  "deal_type",
  "buyer_sector",
  "stage",
  "status",
  "main_category",
  "broad_region",
  "value_band",
  "deadline_band",
  "duration_band",
  "sme_suitability",
  "bid_complexity",
  "competition_level",
  "requirements_preview",
  "relevance_tags",
  "freshness_label",
  "created_at",
  "updated_at",
] as const;

export type DealPreviewPublicColumn =
  (typeof DEAL_PREVIEW_PUBLIC_COLUMNS)[number];

export const DEAL_PREVIEW_PUBLIC_SELECT =
  DEAL_PREVIEW_PUBLIC_COLUMNS.join(", ");

export const DEAL_PREVIEW_SITEMAP_PAGE_SIZE = 1000;
