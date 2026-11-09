import "server-only";

import { getServerEnv, type ServerEnv } from "@/lib/env/server";

type AnnualEnv = Pick<ServerEnv, "DODO_PRO_ANNUAL_PRODUCT_ID" | "SHOW_ANNUAL">;

/**
 * Single source of truth for offering Pro annual (£350/yr).
 *
 * Annual is offered only when BOTH hold, read on the server only:
 * - DODO_PRO_ANNUAL_PRODUCT_ID is set (non-empty), and
 * - SHOW_ANNUAL === "true".
 *
 * Used by every page that renders an annual option and by /api/billing/checkout,
 * which rejects PRO_ANNUAL before any Dodo call when this is false. Only the
 * boolean ever reaches the client; the product id never does.
 * Fails closed: an unreadable server env hides annual.
 */
export function isProAnnualEnabled(env?: AnnualEnv): boolean {
  let source: AnnualEnv;
  try {
    source = env ?? getServerEnv();
  } catch {
    return false;
  }
  return Boolean(source.DODO_PRO_ANNUAL_PRODUCT_ID?.trim()) && source.SHOW_ANNUAL === "true";
}
