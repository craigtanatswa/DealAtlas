import "server-only";

import DodoPayments from "dodopayments";

import { requireDodoApiConfig, requirePlanProductMap } from "@/lib/billing/config";
import { snapshotFromSubscriptionFields } from "@/lib/billing/extract";
import type { SubscriptionSnapshot } from "@/lib/billing/types";

function createDodoClient() {
  const config = requireDodoApiConfig();
  return new DodoPayments({
    bearerToken: config.bearerToken,
    environment: config.environment,
  });
}

export async function reconcileDodoSubscription(
  dodoSubscriptionId: string,
): Promise<SubscriptionSnapshot | null> {
  const client = createDodoClient();
  const products = requirePlanProductMap();
  const subscription = await client.subscriptions.retrieve(dodoSubscriptionId);
  return snapshotFromSubscriptionFields(
    subscription as unknown as Record<string, unknown>,
    products,
  );
}

/** Immediately stop future charges after a refund or lost chargeback. */
export async function cancelDodoSubscription(
  dodoSubscriptionId: string,
): Promise<void> {
  const client = createDodoClient();
  await client.subscriptions.update(dodoSubscriptionId, {
    status: "cancelled",
  });
}
