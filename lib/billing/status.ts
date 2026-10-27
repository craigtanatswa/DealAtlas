import type { SubscriptionStatus } from "@/lib/entitlements/types";

const DODO_STATUS_MAP: Record<string, SubscriptionStatus> = {
  pending: "PENDING",
  active: "ACTIVE",
  on_hold: "ON_HOLD",
  paused: "ON_HOLD",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  failed: "FAILED",
  expired: "EXPIRED",
};

export function mapDodoSubscriptionStatus(
  status: string | null | undefined,
): SubscriptionStatus {
  if (!status) {
    return "UNKNOWN";
  }
  return DODO_STATUS_MAP[status] ?? "UNKNOWN";
}

export function snapshotWouldGrantPro(status: SubscriptionStatus): boolean {
  return status === "ACTIVE";
}

// A subscription in one of these states still bills the customer, so a new
// checkout or a second activation would double-charge them.
export const LIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "ON_HOLD"] as const satisfies readonly SubscriptionStatus[];

export function isLiveSubscriptionStatus(status: SubscriptionStatus): boolean {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}
