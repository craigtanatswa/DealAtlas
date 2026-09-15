/**
 * Public/free data-access surface.
 * Canonical source-bearing queries live in `./canonical` and are server-only.
 */
export type { Database } from "@/lib/db/database.types";
export type { PublicDatabase, PublicTableName } from "@/lib/db/public-schema";
export {
  DEAL_PREVIEW_PUBLIC_COLUMNS,
  DEAL_PREVIEW_PUBLIC_SELECT,
  DEAL_PREVIEW_SITEMAP_COLUMNS,
  DEAL_PREVIEW_SITEMAP_PAGE_SIZE,
  DEAL_PREVIEW_SITEMAP_SELECT,
} from "@/lib/db/preview-columns";
export {
  countPublishedDealPreviewSitemapRows,
  getPublishedDealPreviewByDealId,
  getPublishedDealPreviewBySlug,
  listPublishedDealPreviews,
  listPublishedDealPreviewSitemapRows,
  searchPublishedDealPreviews,
  type DealPreviewPublic,
  type DealPreviewSearchRow,
  type DealPreviewSitemapRow,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
export { DatabaseQueryError } from "@/lib/db/errors";
