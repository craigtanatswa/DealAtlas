import "server-only";

import type { Database } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { structuredLog } from "@/lib/observability/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseInput, uuidSchema } from "@/lib/validation";
import type {
  LifetimeAccess,
  SubscriptionMirror,
} from "@/lib/entitlements/types";

const SUBSCRIPTION_MIRROR_COLUMNS = [
  "user_id",
  "is_current",
  "status",
  "cancel_at_period_end",
  "current_period_start",
  "current_period_end",
  "plan_key",
  "billing_interval",
  "dodo_product_id",
] as const;

const SUBSCRIPTION_MIRROR_COLUMNS_WITH_REVOCATION = [
  ...SUBSCRIPTION_MIRROR_COLUMNS,
  "revoked_at",
] as const;

type SubscriptionMirrorRow = Pick<
  Database["public"]["Tables"]["subscriptions"]["Row"],
  (typeof SUBSCRIPTION_MIRROR_COLUMNS)[number]
> & { revoked_at?: string | null };

/**
 * revoked_at arrives with migration 0064. Until it is applied, retry the read
 * without it (Postgres 42703 = undefined column). Before 0064 no revocation
 * can have been recorded, so a missing column safely maps to revokedAt null.
 */
async function withRevocationFallback<
  R extends { error: { code?: string } | null },
>(run: (columns: string) => PromiseLike<R>): Promise<R> {
  const first = await run(SUBSCRIPTION_MIRROR_COLUMNS_WITH_REVOCATION.join(", "));
  if (first.error?.code !== "42703") return first;
  return run(SUBSCRIPTION_MIRROR_COLUMNS.join(", "));
}

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
    dodoProductId: row.dodo_product_id,
    revokedAt: row.revoked_at ?? null,
  };
}

export async function loadCurrentSubscription(
  userId: string,
): Promise<SubscriptionMirror | null> {
  const id = parseInput(uuidSchema, userId, "User id");
  const { data, error } = await withRevocationFallback((columns) =>
    createSupabaseAdminClient()
      .from("subscriptions")
      .select(columns)
      .eq("user_id", id)
      .eq("is_current", true)
      .maybeSingle(),
  );

  const row = throwIfQueryError("Failed to load subscription", {
    data: (data as unknown as SubscriptionMirrorRow | null) ?? null,
    error,
  });

  return row ? mapSubscriptionRow(row) : null;
}

export async function loadCurrentLifetimeGrant(
  userId: string,
): Promise<LifetimeAccess | null> {
  const id = parseInput(uuidSchema, userId, "User id");
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("lifetime_grants")
      .select("status, dodo_product_id, granted_at")
      .eq("user_id", id)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return null;
    }
    return {
      status: "active",
      dodoProductId: data.dodo_product_id,
      grantedAt: data.granted_at,
    };
  } catch {
    structuredLog({
      level: "warn",
      msg: "Lifetime grant lookup failed; treated as no lifetime access.",
      job: "entitlements",
    });
    return null;
  }
}
