import "server-only";

import { parseRecentAwardStrip, type RecentAwardStrip } from "@/lib/awards/recent";
import type { PublicSupabaseClient } from "@/lib/db/previews";

/** Loads the anonymous award strip. A failed read hides the strip. */
export async function loadRecentAwardStrip(
  client: PublicSupabaseClient,
): Promise<RecentAwardStrip | null> {
  try {
    const { data, error } = await client.rpc("list_recent_award_bands");
    if (error || !data) {
      return null;
    }
    return parseRecentAwardStrip(data);
  } catch {
    return null;
  }
}
