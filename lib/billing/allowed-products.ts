import "server-only";

import { parseProductIdList } from "@/lib/env/production";
import { getServerEnv } from "@/lib/env/server";

/**
 * Product ids that grant DealAtlas Pro in this deployment.
 * Values come only from the environment. Nothing is hardcoded.
 */
export type AllowedProductEnv = {
  DODO_PRO_MONTHLY_PRODUCT_ID?: string | null;
  DODO_PRO_ANNUAL_PRODUCT_ID?: string | null;
  DODO_FOUNDING_PRODUCT_ID?: string | null;
  DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS?: string | null;
};

function addProductId(allowed: Set<string>, value: string | null | undefined): void {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > 0) {
    allowed.add(trimmed);
  }
}

function readDeploymentEnv(): AllowedProductEnv {
  try {
    const env = getServerEnv();
    return {
      DODO_PRO_MONTHLY_PRODUCT_ID: env.DODO_PRO_MONTHLY_PRODUCT_ID,
      DODO_PRO_ANNUAL_PRODUCT_ID: env.DODO_PRO_ANNUAL_PRODUCT_ID,
      DODO_FOUNDING_PRODUCT_ID: env.DODO_FOUNDING_PRODUCT_ID,
      DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS: env.DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS,
    };
  } catch {
    // Missing or invalid server env fails closed: nobody is Pro.
    return {};
  }
}

/**
 * Allowlist for the current environment.
 * Pass `env` in tests. With no argument, reads server env and returns an
 * empty set when that env is missing or invalid.
 */
export function getAllowedProductIds(env?: AllowedProductEnv): ReadonlySet<string> {
  const source = env ?? readDeploymentEnv();
  const allowed = new Set<string>();
  addProductId(allowed, source.DODO_PRO_MONTHLY_PRODUCT_ID);
  addProductId(allowed, source.DODO_PRO_ANNUAL_PRODUCT_ID);
  addProductId(allowed, source.DODO_FOUNDING_PRODUCT_ID);
  for (const id of parseProductIdList(source.DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS)) {
    addProductId(allowed, id);
  }
  return allowed;
}
