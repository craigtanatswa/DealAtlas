import type { CheckoutAnalyticsPlan } from "@/lib/analytics/events";
import { isFoundingProduct } from "@/lib/billing/plans";
import type { IncomingBillingEvent, PlanProductMap } from "@/lib/billing/types";

/**
 * The analytics plan for pro_subscribed, or null when the event is not a new
 * active subscription on a known product.
 */
export function proSubscribedPlan(
  event: IncomingBillingEvent,
  products: PlanProductMap,
): CheckoutAnalyticsPlan | null {
  const snapshot = event.subscription;
  if (
    event.eventType !== "subscription.active" ||
    !snapshot ||
    !snapshot.productKnown ||
    snapshot.status !== "ACTIVE"
  ) {
    return null;
  }
  if (isFoundingProduct(snapshot.dodoProductId, products)) {
    return "founding";
  }
  if (snapshot.planKey === "PRO_MONTHLY") {
    return "monthly";
  }
  if (snapshot.planKey === "PRO_ANNUAL") {
    return "annual";
  }
  return null;
}
