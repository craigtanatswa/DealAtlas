import { format } from "date-fns";

import { DISPLAY_PRICING } from "@/lib/constants";
import { PLAN_PUBLIC_NAME } from "@/lib/billing/lifetime-copy";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import type { CheckoutPlanKey } from "@/lib/billing/types";

export const PLAN_KEY_LABELS: Record<CheckoutPlanKey, string> = {
  PRO_MONTHLY: "Pro monthly",
  PRO_ANNUAL: "Pro annual",
  founding_lifetime: PLAN_PUBLIC_NAME,
};

export const STATUS_LABELS: Record<string, string> = {
  NONE: "No subscription",
  PENDING: "Pending",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
};

export function planLabel(
  planKey: string | null,
  billingInterval: string | null,
  foundingMember = false,
  term: string | null = null,
): string {
  void foundingMember;
  if (term === "lifetime" || planKey === "founding_lifetime") {
    return PLAN_KEY_LABELS.founding_lifetime;
  }
  if (planKey === "PRO_MONTHLY" || billingInterval === "MONTHLY") {
    return PLAN_KEY_LABELS.PRO_MONTHLY;
  }
  if (planKey === "PRO_ANNUAL" || billingInterval === "ANNUAL") {
    // Legacy annual founders keep their annual plan; no founding wording.
    return PLAN_KEY_LABELS.PRO_ANNUAL;
  }
  return "Free";
}

export function priceLabel(planKey: CheckoutPlanKey): string {
  if (planKey === "founding_lifetime") {
    return DISPLAY_PRICING.proLifetime;
  }
  return planKey === "PRO_ANNUAL"
    ? DISPLAY_PRICING.proAnnual
    : DISPLAY_PRICING.proMonthly;
}

export function formatBillingDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return format(new Date(parsed), "d MMMM yyyy");
}

export function accessUntilCopy(entitlement: EntitlementSnapshot): string | null {
  if (entitlement.term === "lifetime" || entitlement.planKey === "founding_lifetime") {
    return null;
  }
  if (!entitlement.cancelAtPeriodEnd || !entitlement.currentPeriodEnd) {
    return null;
  }
  const formatted = formatBillingDate(entitlement.currentPeriodEnd);
  return formatted ? `Pro access continues until ${formatted}.` : null;
}
