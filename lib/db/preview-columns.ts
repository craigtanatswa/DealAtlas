/**
 * Explicit deal_previews columns for public/free query paths.
 * Never select every column in public deal code.
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

/**
 * Explicit columns for sitemap indexability checks. URLs emitted to sitemap
 * XML use slug only — never buyer/source identity or alternate text.
 */
export const DEAL_PREVIEW_SITEMAP_COLUMNS = [
  "slug",
  "preview_title",
  "preview_summary",
  "main_category",
  "broad_region",
  "value_band",
  "deadline_band",
  "status",
  "updated_at",
] as const;

export type DealPreviewSitemapColumn =
  (typeof DEAL_PREVIEW_SITEMAP_COLUMNS)[number];

export const DEAL_PREVIEW_SITEMAP_SELECT =
  DEAL_PREVIEW_SITEMAP_COLUMNS.join(", ");

export const DEAL_PREVIEW_SITEMAP_PAGE_SIZE = 1000;
