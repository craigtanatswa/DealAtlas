import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import type { PublishedAlertPreview } from "@/lib/alerts/dto";

const CHUNK = 100;

/**
 * Previews that may appear in alerts: published, LOW risk and not held by an
 * admin. Same filters as the public DTO RPCs.
 */
export async function loadPublishedAlertPreviews(
  admin: SupabaseClient<Database>,
  dealIds: Array<string | null>,
): Promise<Map<string, PublishedAlertPreview & { dealId: string; slug: string; previewSummary: string }>> {
  const ids = [...new Set(dealIds.filter((id): id is string => Boolean(id)))];
  const previews = new Map<
    string,
    PublishedAlertPreview & { dealId: string; slug: string; previewSummary: string }
  >();
  for (let index = 0; index < ids.length; index += CHUNK) {
    const { data, error } = await admin
      .from("deal_previews")
      .select("deal_id, slug, preview_title, preview_summary, deadline_band, value_band, main_category, broad_region")
      .in("deal_id", ids.slice(index, index + CHUNK))
      .eq("is_published", true)
      .eq("leakage_risk", "LOW")
      .eq("unpublished_by_admin", false);
    const rows = throwIfQueryError("Failed to load published alert previews", {
      data: data ?? [],
      error,
    });
    for (const row of rows) {
      previews.set(row.deal_id, {
        dealId: row.deal_id,
        slug: row.slug,
        previewTitle: row.preview_title,
        previewSummary: row.preview_summary,
        deadlineBand: row.deadline_band,
        valueBand: row.value_band,
        category: row.main_category,
        region: row.broad_region,
      });
    }
  }
  return previews;
}
