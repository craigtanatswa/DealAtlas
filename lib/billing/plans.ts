import { z } from "zod";

import type { BillingInterval } from "@/lib/entitlements/types";
import {
  CHECKOUT_PLAN_KEYS,
  SUBSCRIPTION_PLAN_KEYS,
  type CheckoutPlanKey,
  type FoundingReservation,
  type MappedPlan,
  type PlanProductMap,
  type SubscriptionPlanKey,
} from "@/lib/billing/types";

export {
  CHECKOUT_PLAN_KEYS,
  SUBSCRIPTION_PLAN_KEYS,
  type CheckoutPlanKey,
  type PlanProductMap,
  type SubscriptionPlanKey,
};

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
  return planKey === "PRO_MONTHLY" ? "MONTHLY" : "ANNUAL";
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
    return { ok: false, error: "Choose a DealAtlas Pro plan." };
  }

  return { ok: true, planKey: parsed.data };
}

export function subscriptionPlanKeyFor(
  planKey: CheckoutPlanKey,
): SubscriptionPlanKey {
  return planKey === "FOUNDING" ? "PRO_ANNUAL" : planKey;
}

export function mapPlanKey(
  planKey: SubscriptionPlanKey,
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
  if (products.PRO_ANNUAL_LEGACY.includes(productId)) {
    return mapPlanKey("PRO_ANNUAL", products);
  }
  if (products.FOUNDING_ANNUAL && productId === products.FOUNDING_ANNUAL) {
    return mapPlanKey("PRO_ANNUAL", products);
  }
  return null;
}

export function isFoundingProduct(
  productId: string | null | undefined,
  products: PlanProductMap,
): boolean {
  return Boolean(productId && products.FOUNDING_ANNUAL && productId === products.FOUNDING_ANNUAL);
}

/** Products a user may start checkout with. Legacy annual is never offered. */
export function checkoutProductIds(products: PlanProductMap): string[] {
  return [products.PRO_MONTHLY, products.PRO_ANNUAL, products.FOUNDING_ANNUAL].filter(
    (id): id is string => Boolean(id),
  );
}

/** Products accepted from the provider webhook, including legacy annual plans. */
export function webhookAcceptedProductIds(products: PlanProductMap): string[] {
  return [...checkoutProductIds(products), ...products.PRO_ANNUAL_LEGACY];
}

export function allowlistedProductIds(products: PlanProductMap): string[] {
  return checkoutProductIds(products);
}

export type CheckoutSelection =
  | { ok: true; productId: string; founding: boolean }
  | { ok: false; reason: "founding_unavailable" };

/** The browser sends a plan key. The server picks the Dodo product. */
export function selectCheckoutProduct(input: {
  planKey: CheckoutPlanKey;
  products: PlanProductMap;
  founder: boolean;
  reservation: FoundingReservation | null;
}): CheckoutSelection {
  if (input.planKey === "PRO_MONTHLY") {
    return { ok: true, productId: input.products.PRO_MONTHLY, founding: false };
  }

  if (input.planKey === "PRO_ANNUAL") {
    if (input.founder && input.products.FOUNDING_ANNUAL) {
      return {
        ok: true,
        productId: input.products.FOUNDING_ANNUAL,
        founding: true,
      };
    }
    return { ok: true, productId: input.products.PRO_ANNUAL, founding: false };
  }

  if (!input.products.FOUNDING_ANNUAL) {
    return { ok: false, reason: "founding_unavailable" };
  }
  if (input.founder) {
    return {
      ok: true,
      productId: input.products.FOUNDING_ANNUAL,
      founding: true,
    };
  }
  if (
    input.reservation === "reserved" ||
    input.reservation === "active" ||
    input.reservation === "closed"
  ) {
    return {
      ok: true,
      productId: input.products.FOUNDING_ANNUAL,
      founding: true,
    };
  }
  return { ok: false, reason: "founding_unavailable" };
}

export function shouldReserveFoundingSlot(
  planKey: CheckoutPlanKey,
  products: PlanProductMap,
  founder: boolean,
): boolean {
  return planKey === "FOUNDING" && Boolean(products.FOUNDING_ANNUAL) && !founder;
}
