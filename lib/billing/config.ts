import "server-only";

import { BillingConfigError } from "@/lib/billing/errors";
import type { PlanProductMap } from "@/lib/billing/types";
import { parseProductIdList } from "@/lib/env/production";
import { getServerEnv } from "@/lib/env/server";

export function assertDistinctLegacyProductIds(products: PlanProductMap): void {
  const currentIds = [
    products.PRO_MONTHLY,
    products.PRO_ANNUAL,
    products.FOUNDING_ANNUAL,
  ].filter((id): id is string => Boolean(id));
  if (
    products.PRO_ANNUAL_LEGACY.some((legacyId) =>
      currentIds.includes(legacyId),
    )
  ) {
    throw new BillingConfigError(
      "DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS must not reuse a monthly, annual, or founding product id.",
    );
  }
}

export function getPlanProductMap(): PlanProductMap | null {
  const env = getServerEnv();
  if (!env.DODO_PRO_MONTHLY_PRODUCT_ID || !env.DODO_PRO_ANNUAL_PRODUCT_ID) {
    return null;
  }
  const founding = env.DODO_FOUNDING_PRODUCT_ID;
  const products: PlanProductMap = {
    PRO_MONTHLY: env.DODO_PRO_MONTHLY_PRODUCT_ID,
    PRO_ANNUAL: env.DODO_PRO_ANNUAL_PRODUCT_ID,
    PRO_ANNUAL_LEGACY: [
      ...new Set(
        parseProductIdList(env.DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS),
      ),
    ],
    ...(founding ? { FOUNDING_ANNUAL: founding } : {}),
  };
  assertDistinctLegacyProductIds(products);
  return products;
}

export function requirePlanProductMap(): PlanProductMap {
  const products = getPlanProductMap();
  if (!products) {
    throw new BillingConfigError(
      "Dodo product IDs are not configured on the server.",
    );
  }
  return products;
}

export function requireDodoCheckoutConfig() {
  const env = getServerEnv();
  const products = requirePlanProductMap();
  if (
    !env.DODO_PAYMENTS_API_KEY ||
    !env.DODO_PAYMENTS_RETURN_URL ||
    !env.DODO_PAYMENTS_WEBHOOK_KEY
  ) {
    throw new BillingConfigError("Dodo checkout is not configured.");
  }
  return {
    bearerToken: env.DODO_PAYMENTS_API_KEY,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
    returnUrl: env.DODO_PAYMENTS_RETURN_URL,
    products,
  };
}

export function requireDodoApiConfig() {
  const env = getServerEnv();
  if (!env.DODO_PAYMENTS_API_KEY) {
    throw new BillingConfigError("Dodo API is not configured.");
  }
  return {
    bearerToken: env.DODO_PAYMENTS_API_KEY,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
  };
}

export function requireDodoWebhookKey() {
  const env = getServerEnv();
  if (!env.DODO_PAYMENTS_WEBHOOK_KEY) {
    throw new BillingConfigError("Dodo webhook signing key is not configured.");
  }
  return env.DODO_PAYMENTS_WEBHOOK_KEY;
}
