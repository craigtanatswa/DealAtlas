import "server-only";

import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import { foundingConfigured, readFoundingRemaining } from "@/lib/billing/founding-db";

/**
 * Public founding state: offered + sold_out only. No count, used or cap.
 * Missing DODO_FOUNDING_PRODUCT_ID fails closed (not offered, sold out).
 */
export async function readFoundingPublicCount(): Promise<FoundingPublicCount> {
  if (!foundingConfigured()) {
    return { offered: false, sold_out: true };
  }
  const remaining = await readFoundingRemaining();
  return { offered: true, sold_out: remaining <= 0 };
}
