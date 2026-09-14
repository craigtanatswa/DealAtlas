import "server-only";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseInput, uuidSchema } from "@/lib/validation";
import type { SubscriptionMirror } from "@/lib/entitlements/types";

const SUBSCRIPTION_MIRROR_COLUMNS = [
  "user_id",
  "is_current",
  "status",
  "cancel_at_period_end",
  "current_period_start",
  "current_period_end",
  "plan_key",
  "billing_interval",
] as const;

type SubscriptionMirrorRow = Pick<
  Database["public"]["Tables"]["subscriptions"]["Row"],
  (typeof SUBSCRIPTION_MIRROR_COLUMNS)[number]
>;

function mapSubscriptionRow(row: SubscriptionMirrorRow): SubscriptionMirror {
  return {
    userId: row.user_id,
    isCurrent: row.is_current,
    status: row.status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    planKey: row.plan_key,
    billingInterval: row.billing_interval,
  };
}

export async function loadCurrentSubscription(
  userId: string,
): Promise<SubscriptionMirror | null> {
  const id = parseInput(uuidSchema, userId, "User id");
  const { data, error } = await createSupabaseAdminClient()
    .from("subscriptions")
    .select(SUBSCRIPTION_MIRROR_COLUMNS.join(", "))
    .eq("user_id", id)
    .eq("is_current", true)
    .maybeSingle();

  const row = throwIfQueryError("Failed to load subscription", {
    data: (data as unknown as SubscriptionMirrorRow | null) ?? null,
    error,
  });

  return row ? mapSubscriptionRow(row) : null;
}
