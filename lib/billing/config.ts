import "server-only";

import { BillingConfigError } from "@/lib/billing/errors";
import type { PlanProductMap } from "@/lib/billing/types";
import { getServerEnv } from "@/lib/env/server";

export function getPlanProductMap(): PlanProductMap | null {
  const env = getServerEnv();
  if (!env.DODO_PRO_MONTHLY_PRODUCT_ID || !env.DODO_PRO_ANNUAL_PRODUCT_ID) {
    return null;
  }
  return {
    PRO_MONTHLY: env.DODO_PRO_MONTHLY_PRODUCT_ID,
    PRO_ANNUAL: env.DODO_PRO_ANNUAL_PRODUCT_ID,
  };
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
  if (!env.DODO_PAYMENTS_API_KEY || !env.DODO_PAYMENTS_RETURN_URL) {
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
