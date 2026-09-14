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
