import "server-only";

import { FOUNDING_CAP, type FoundingPublicCount } from "@/lib/billing/founding-ui";
import { readFoundingRemaining } from "@/lib/billing/founding-db";
import { getServerEnv } from "@/lib/env/server";

/** Counts only. `offered` is server config, not a customer list. */
export async function readFoundingPublicCount(): Promise<FoundingPublicCount> {
  const env = getServerEnv();
  if (!env.DODO_FOUNDING_PRODUCT_ID) {
    return { offered: false, remaining: 0, cap: FOUNDING_CAP };
  }
  return {
    offered: true,
    remaining: await readFoundingRemaining(),
    cap: FOUNDING_CAP,
  };
}
