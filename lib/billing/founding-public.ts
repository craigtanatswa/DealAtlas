import "server-only";

import { unstable_cache } from "next/cache";

import type { FoundingPublicCount } from "@/lib/billing/founding-ui";
import { foundingConfigured, readFoundingRemaining } from "@/lib/billing/founding-db";

/** Seconds the public sold-out flag is shared across requests. */
export const FOUNDING_PUBLIC_REVALIDATE_SECONDS = 60;

/**
 * Only the boolean is cached: founding_availability is a global aggregate
 * (no user, no source fields), and the exact count never enters the cache.
 */
const readFoundingSoldOut = unstable_cache(
  async (): Promise<boolean> => (await readFoundingRemaining()) <= 0,
  ["founding-public-sold-out-v1"],
  { revalidate: FOUNDING_PUBLIC_REVALIDATE_SECONDS },
);

/**
 * Public founding state: offered + sold_out only. No count, used or cap.
 * Missing DODO_FOUNDING_PRODUCT_ID fails closed (not offered, sold out).
 */
export async function readFoundingPublicCount(): Promise<FoundingPublicCount> {
  if (!foundingConfigured()) {
    return { offered: false, sold_out: true };
  }
  return { offered: true, sold_out: await readFoundingSoldOut() };
}
