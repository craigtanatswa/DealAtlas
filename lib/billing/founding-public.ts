import "server-only";

import type { FoundingAvailability } from "@/lib/billing/founding-ui";
import { readFoundingRemaining } from "@/lib/billing/founding-db";
import { getServerEnv } from "@/lib/env/server";

/** Only the boolean leaves this function. The number never reaches the UI. */
export async function readFoundingAvailability(): Promise<FoundingAvailability | null> {
  const env = getServerEnv();
  // Not offered: null keeps every founding surface hidden (not "sold out").
  if (!env.DODO_FOUNDING_PRODUCT_ID) return null;
  return { available: (await readFoundingRemaining()) > 0 };
}
