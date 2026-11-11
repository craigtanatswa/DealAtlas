import { checkoutMetadata } from "@/lib/billing/metadata";
import type { CheckoutPlanKey, PlanProductMap } from "@/lib/billing/types";

export type CheckoutSessionBodyInput = {
  planKey: CheckoutPlanKey;
  productId?: string;
  products?: PlanProductMap;
  userId: string;
  email: string;
  customerName?: string;
  name?: string;
  returnUrl: string;
};

function resolveProductId(input: CheckoutSessionBodyInput): string {
  if (input.productId) {
    return input.productId;
  }
  const products = input.products;
  if (!products) {
    throw new Error("A checkout product id is required.");
  }
  const productId =
    input.planKey === "PRO_MONTHLY"
      ? products.PRO_MONTHLY
      : input.planKey === "PRO_ANNUAL"
        ? products.PRO_ANNUAL
        : products.FOUNDING_LIFETIME;
  if (!productId) {
    throw new Error("A checkout product id is required.");
  }
  return productId;
}

/** Metadata plan key for the provider session. Lifetime is not a subscription. */
export function checkoutMetadataPlanKey(planKey: CheckoutPlanKey): string {
  if (planKey === "founding_lifetime") {
    return "founding_lifetime";
  }
  return planKey;
}

/**
 * Pure checkout session body for every plan, so it can be unit-tested.
 * Lifetime is a one-time product: no subscription_data, trial or on-demand.
 */
export function buildCheckoutSessionBody(
  input: CheckoutSessionBodyInput,
): Record<string, unknown> {
  const productId = resolveProductId(input);
  const customerName =
    input.customerName?.trim() || input.name?.trim() || "DealAtlas customer";

  return {
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: {
      email: input.email,
      name: customerName,
    },
    metadata: checkoutMetadata({
      userId: input.userId,
      planKey: checkoutMetadataPlanKey(input.planKey),
    }),
    return_url: input.returnUrl,
    billing_currency: "GBP",
    feature_flags: {
      allow_customer_editing_email: false,
      allow_discount_code: true,
    },
  };
}
