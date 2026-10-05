import type { Database } from "@/lib/db/database.types";

/**
 * Tables and RPCs that ordinary client roles may use. Canonical source-bearing
 * tables are intentionally omitted, and deal_previews is reachable only through
 * the sanitised preview DTO RPCs (table grants are revoked in 0019).
 */
export const PUBLIC_TABLE_NAMES = [
  "profiles",
  "company_profiles",
  "deal_matches",
  "saved_deals",
  "saved_searches",
  "watched_organizations",
  "notification_preferences",
] as const;

export type PublicTableName = (typeof PUBLIC_TABLE_NAMES)[number];

export const PUBLIC_FUNCTION_NAMES = [
  "search_preview_dtos",
  "get_preview_dto_by_slug",
  "get_preview_dto_by_deal_id",
  "resolve_preview_deal_id",
  "list_saved_deal_previews",
  "list_preview_sitemap_entries",
  "count_preview_sitemap_entries",
] as const;

export type PublicFunctionName = (typeof PUBLIC_FUNCTION_NAMES)[number];

export type PublicDatabase = {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Pick<Database["public"]["Tables"], PublicTableName>;
    Functions: Pick<Database["public"]["Functions"], PublicFunctionName>;
  };
};
