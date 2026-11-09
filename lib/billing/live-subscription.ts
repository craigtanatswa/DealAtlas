import "server-only";

import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * True when the user already holds a live Pro or Founding subscription.
 * Throws on any read error so checkout fails closed.
 */
export async function hasLiveSubscription(userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const [subscriptions, profile] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", [...LIVE_SUBSCRIPTION_STATUSES])
      .limit(1),
    admin.from("profiles").select("founding_member").eq("id", userId).maybeSingle(),
  ]);
  if (subscriptions.error || profile.error) {
    throw new Error("Failed to check existing subscriptions.");
  }
  return (subscriptions.data?.length ?? 0) > 0 || profile.data?.founding_member === true;
}
