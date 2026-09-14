import { format } from "date-fns";

import { DISPLAY_PRICING } from "@/lib/constants";
import type { EntitlementSnapshot } from "@/lib/entitlements/types";
import type { CheckoutPlanKey } from "@/lib/billing/types";

export const PLAN_KEY_LABELS: Record<CheckoutPlanKey, string> = {
  PRO_MONTHLY: "Pro monthly",
  PRO_ANNUAL: "Pro annual",
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

export function planLabel(planKey: string | null, billingInterval: string | null): string {
  if (planKey === "PRO_MONTHLY" || billingInterval === "MONTHLY") {
    return PLAN_KEY_LABELS.PRO_MONTHLY;
  }
  if (planKey === "PRO_ANNUAL" || billingInterval === "ANNUAL") {
    return PLAN_KEY_LABELS.PRO_ANNUAL;
  }
  return "Free";
}

export function priceLabel(planKey: CheckoutPlanKey): string {
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
  if (!entitlement.cancelAtPeriodEnd || !entitlement.currentPeriodEnd) {
    return null;
  }
  const formatted = formatBillingDate(entitlement.currentPeriodEnd);
  return formatted ? `Pro access continues until ${formatted}.` : null;
}
