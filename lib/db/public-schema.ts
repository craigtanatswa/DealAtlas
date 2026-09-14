import type { Database } from "@/lib/db/database.types";

/**
 * Tables and RPCs that ordinary client roles are granted in migration 0004.
 * Canonical source-bearing tables are intentionally omitted.
 */
export const PUBLIC_TABLE_NAMES = [
  "deal_previews",
  "profiles",
  "company_profiles",
  "deal_matches",
  "saved_deals",
  "saved_searches",
  "watched_organizations",
  "notification_preferences",
] as const;

export type PublicTableName = (typeof PUBLIC_TABLE_NAMES)[number];

export const PUBLIC_FUNCTION_NAMES = ["search_deal_previews"] as const;

export type PublicFunctionName = (typeof PUBLIC_FUNCTION_NAMES)[number];

export type PublicDatabase = {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Pick<Database["public"]["Tables"], PublicTableName>;
    Functions: Pick<Database["public"]["Functions"], PublicFunctionName>;
  };
};
