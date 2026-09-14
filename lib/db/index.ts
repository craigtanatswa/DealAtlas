/**
 * Public/free data-access surface.
 * Canonical source-bearing queries live in `./canonical` and are server-only.
 */
export type { Database } from "@/lib/db/database.types";
export type { PublicDatabase, PublicTableName } from "@/lib/db/public-schema";
export {
  DEAL_PREVIEW_PUBLIC_COLUMNS,
  DEAL_PREVIEW_PUBLIC_SELECT,
} from "@/lib/db/preview-columns";
export {
  getPublishedDealPreviewByDealId,
  getPublishedDealPreviewBySlug,
  listPublishedDealPreviews,
  searchPublishedDealPreviews,
  type DealPreviewPublic,
  type DealPreviewSearchRow,
  type PublicSupabaseClient,
} from "@/lib/db/previews";
export { DatabaseQueryError } from "@/lib/db/errors";
