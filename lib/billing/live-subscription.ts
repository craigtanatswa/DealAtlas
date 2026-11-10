import "server-only";

import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * True when the user already holds a live Pro subscription or active lifetime
 * grant. Throws on any read error so checkout fails closed.
 */
export async function hasLiveSubscription(userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const [subscriptions, profile, lifetime] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", [...LIVE_SUBSCRIPTION_STATUSES])
      .limit(1),
    admin.from("profiles").select("founding_member").eq("id", userId).maybeSingle(),
    admin
      .from("lifetime_grants")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1),
  ]);
  if (subscriptions.error || profile.error) {
    throw new Error("Failed to check existing subscriptions.");
  }
  return (
    (subscriptions.data?.length ?? 0) > 0 ||
    profile.data?.founding_member === true ||
    (!lifetime.error && (lifetime.data?.length ?? 0) > 0)
  );
}
