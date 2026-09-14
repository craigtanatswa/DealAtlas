import { z } from "zod";

import type { BillingInterval } from "@/lib/entitlements/types";
import {
  CHECKOUT_PLAN_KEYS,
  type CheckoutPlanKey,
  type MappedPlan,
  type PlanProductMap,
} from "@/lib/billing/types";

export { CHECKOUT_PLAN_KEYS, type CheckoutPlanKey, type PlanProductMap };

export const checkoutPlanKeySchema = z.enum(CHECKOUT_PLAN_KEYS);

export function isCheckoutPlanKey(value: unknown): value is CheckoutPlanKey {
  return (
    typeof value === "string" &&
    (CHECKOUT_PLAN_KEYS as readonly string[]).includes(value)
  );
}

export function billingIntervalForPlan(
  planKey: CheckoutPlanKey,
): BillingInterval {
  return planKey === "PRO_ANNUAL" ? "ANNUAL" : "MONTHLY";
}

export function parseCheckoutRequest(
  input: unknown,
): { ok: true; planKey: CheckoutPlanKey } | { ok: false; error: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Choose monthly or annual Pro." };
  }

  const body = input as Record<string, unknown>;
  const forbidden = [
    "productId",
    "product_id",
    "product_cart",
    "user_id",
    "userId",
    "customer_id",
    "customerId",
    "metadata",
  ];
  if (forbidden.some((key) => key in body)) {
    return {
      ok: false,
      error: "Checkout only accepts a server-mapped plan key.",
    };
  }

  const parsed = checkoutPlanKeySchema.safeParse(body.planKey);
  if (!parsed.success) {
    return { ok: false, error: "Choose monthly or annual Pro." };
  }

  return { ok: true, planKey: parsed.data };
}

export function mapPlanKey(
  planKey: CheckoutPlanKey,
  products: PlanProductMap,
): MappedPlan {
  const productId = products[planKey];
  return {
    planKey,
    productId,
    billingInterval: billingIntervalForPlan(planKey),
  };
}

export function mapProductId(
  productId: string | null | undefined,
  products: PlanProductMap,
): MappedPlan | null {
  if (!productId) {
    return null;
  }

  if (productId === products.PRO_MONTHLY) {
    return mapPlanKey("PRO_MONTHLY", products);
  }
  if (productId === products.PRO_ANNUAL) {
    return mapPlanKey("PRO_ANNUAL", products);
  }
  return null;
}

export function allowlistedProductIds(products: PlanProductMap): string[] {
  return [products.PRO_MONTHLY, products.PRO_ANNUAL];
}
