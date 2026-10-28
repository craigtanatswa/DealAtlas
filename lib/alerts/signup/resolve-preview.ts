import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { parseInputSafe, slugSchema } from "@/lib/validation";

export type PublicAlertScope = {
  mainCategory: string | null;
  broadRegion: string | null;
};

type Admin = SupabaseClient<Database>;

/**
 * Resolve a deal slug to PUBLIC preview attributes only.
 * Unknown / unpublished / non-LOW → empty general scope (never reveals existence).
 */
export async function resolvePublicAlertScope(
  admin: Admin,
  dealSlug: string | undefined | null,
): Promise<PublicAlertScope> {
  if (!dealSlug) {
    return { mainCategory: null, broadRegion: null };
  }
  const parsed = parseInputSafe(slugSchema, dealSlug);
  if (!parsed.success) {
    return { mainCategory: null, broadRegion: null };
  }

  const { data, error } = await admin
    .from("deal_previews")
    .select("main_category, broad_region")
    .eq("slug", parsed.data)
    .eq("is_published", true)
    .eq("leakage_risk", "LOW")
    .eq("unpublished_by_admin", false)
    .maybeSingle();

  if (error || !data) {
    return { mainCategory: null, broadRegion: null };
  }

  return {
    mainCategory:
      typeof data.main_category === "string" && data.main_category.trim()
        ? data.main_category.trim()
        : null,
    broadRegion:
      typeof data.broad_region === "string" && data.broad_region.trim()
        ? data.broad_region.trim()
        : null,
  };
}
