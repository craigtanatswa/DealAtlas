import "server-only";

import type { Database, Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BillingEventRecord,
  BillingStore,
  GrantLifetimeResult,
  IncomingBillingEvent,
  PaymentFacts,
  RevokeLifetimeResult,
  RevokeSubscriptionResult,
  StoredSubscription,
} from "@/lib/billing/types";

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type BillingEventRow = Database["public"]["Tables"]["billing_events"]["Row"];

const SUBSCRIPTION_COLUMNS = [
  "user_id",
  "dodo_customer_id",
  "dodo_subscription_id",
  "dodo_product_id",
  "plan_key",
  "status",
  "billing_interval",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
  "cancelled_at",
  "last_provider_event_at",
  "is_current",
] as const;

const SUBSCRIPTION_REVOKE_COLUMNS = ["revoked_at", "revoke_reason"] as const;

const SUBSCRIPTION_COLUMNS_WITH_REVOCATION = [
  ...SUBSCRIPTION_COLUMNS,
  ...SUBSCRIPTION_REVOKE_COLUMNS,
] as const;

type SubscriptionReadRow = Pick<
  SubscriptionRow,
  (typeof SUBSCRIPTION_COLUMNS)[number]
> & {
  revoked_at?: string | null;
  revoke_reason?: string | null;
};

function isMissingColumnError(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/**
 * revoked_at/revoke_reason arrive with migration 0064. Until it is applied,
 * retry reads without them (Postgres 42703 = undefined column). Before 0064 no
 * revocation can have been recorded, so a missing column maps to null.
 */
async function withSubscriptionRevocationFallback<
  R extends { error: { code?: string } | null },
>(
  columns: readonly string[],
  run: (columns: string) => PromiseLike<R>,
): Promise<R> {
  const first = await run(columns.join(", "));
  if (first.error?.code !== "42703") return first;
  return run(
    columns
      .filter(
        (column) =>
          !(SUBSCRIPTION_REVOKE_COLUMNS as readonly string[]).includes(column),
      )
      .join(", "),
  );
}

function mapEvent(row: BillingEventRow): BillingEventRecord {
  return {
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    payloadHash: row.payload_hash,
    status: row.status,
  };
}

function mapSubscription(row: SubscriptionReadRow): StoredSubscription {
  return {
    userId: row.user_id,
    dodoCustomerId: row.dodo_customer_id,
    dodoSubscriptionId: row.dodo_subscription_id,
    dodoProductId: row.dodo_product_id,
    planKey: row.plan_key,
    status: row.status,
    billingInterval: row.billing_interval,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelledAt: row.cancelled_at,
    lastProviderEventAt: row.last_provider_event_at,
    isCurrent: row.is_current,
    revokedAt: row.revoked_at ?? null,
    revokeReason: row.revoke_reason ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapPaymentFacts(payload: Json): PaymentFacts {
  const data = asRecord(asRecord(payload).data);
  return {
    subscriptionId: readString(data.subscription_id),
    totalAmount: readNumber(data.total_amount),
    currency: readString(data.currency),
  };
}

export function createBillingStore(): BillingStore {
  const admin = createSupabaseAdminClient();

  return {
    async getEvent(providerEventId) {
      const { data, error } = await admin
        .from("billing_events")
        .select(
          "provider_event_id, event_type, payload_hash, status",
        )
        .eq("provider", "DODO")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load billing event", {
        data,
        error,
      });
      return row ? mapEvent(row as BillingEventRow) : null;
    },

    async insertReceivedEvent(event: IncomingBillingEvent) {
      const { data, error } = await admin
        .from("billing_events")
        .insert({
          provider: "DODO",
          provider_event_id: event.providerEventId,
          event_type: event.eventType,
          payload_hash: event.payloadHash,
          payload: event.payload as Json,
          status: "RECEIVED",
        })
        .select("provider_event_id, event_type, payload_hash, status")
        .maybeSingle();

      if (error?.code === "23505") {
        const existing = await this.getEvent(event.providerEventId);
        if (!existing) {
          throw error;
        }
        return { inserted: false, record: existing };
      }

      const row = throwIfQueryError("Failed to record billing event", {
        data,
        error,
      });
      if (!row) {
        throw new Error("Failed to record billing event.");
      }
      return { inserted: true, record: mapEvent(row as BillingEventRow) };
    },

    async markEvent(providerEventId, status, processingError) {
      const { error } = await admin
        .from("billing_events")
        .update({
          status,
          processed_at: new Date().toISOString(),
          processing_error: processingError ?? null,
        })
        .eq("provider", "DODO")
        .eq("provider_event_id", providerEventId);
      throwIfQueryError("Failed to update billing event", {
        data: null,
        error,
      });
    },

    async profileExists(userId) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load profile for billing", {
        data,
        error,
      });
      return Boolean(row);
    },

    async getSubscriptionByDodoId(dodoSubscriptionId) {
      const { data, error } = await withSubscriptionRevocationFallback(
        SUBSCRIPTION_COLUMNS_WITH_REVOCATION,
        (columns) =>
          admin
            .from("subscriptions")
            .select(columns)
            .eq("dodo_subscription_id", dodoSubscriptionId)
            .maybeSingle(),
      );
      const row = throwIfQueryError("Failed to load subscription", {
        data,
        error,
      });
      return row ? mapSubscription(row as unknown as SubscriptionReadRow) : null;
    },

    async getSubscriptionByCustomerId(dodoCustomerId) {
      const { data, error } = await withSubscriptionRevocationFallback(
        SUBSCRIPTION_COLUMNS_WITH_REVOCATION,
        (columns) =>
          admin
            .from("subscriptions")
            .select(columns)
            .eq("dodo_customer_id", dodoCustomerId)
            .eq("is_current", true)
            .maybeSingle(),
      );
      const row = throwIfQueryError("Failed to load subscription by customer", {
        data,
        error,
      });
      return row ? mapSubscription(row as unknown as SubscriptionReadRow) : null;
    },

    async getCurrentSubscription(userId) {
      const { data, error } = await withSubscriptionRevocationFallback(
        SUBSCRIPTION_COLUMNS_WITH_REVOCATION,
        (columns) =>
          admin
            .from("subscriptions")
            .select(columns)
            .eq("user_id", userId)
            .eq("is_current", true)
            .maybeSingle(),
      );
      const row = throwIfQueryError("Failed to load current subscription", {
        data,
        error,
      });
      return row ? mapSubscription(row as unknown as SubscriptionReadRow) : null;
    },

    async upsertCurrentSubscription(row: StoredSubscription) {
      // Revoked is terminal for the same provider subscription id. Read first
      // so a late provider event cannot clear the marker or re-grant Pro.
      const { data: existing, error: existingError } =
        await withSubscriptionRevocationFallback(
          ["dodo_subscription_id", "revoked_at"],
          (columns) =>
            admin
              .from("subscriptions")
              .select(columns)
              .eq("dodo_subscription_id", row.dodoSubscriptionId ?? "__none__")
              .maybeSingle(),
        );
      throwIfQueryError("Failed to load existing subscription", {
        data: existing,
        error: existingError,
      });
      const existingSubscription =
        existing as unknown as { revoked_at?: string | null } | null;
      if (existingSubscription?.revoked_at) {
        return;
      }

      const { error: clearError } = await admin
        .from("subscriptions")
        .update({ is_current: false, updated_at: new Date().toISOString() })
        .eq("user_id", row.userId)
        .eq("is_current", true)
        .neq("dodo_subscription_id", row.dodoSubscriptionId ?? "__none__");
      throwIfQueryError("Failed to clear current subscription", {
        data: null,
        error: clearError,
      });

      const payload = {
        user_id: row.userId,
        provider: "DODO",
        dodo_customer_id: row.dodoCustomerId,
        dodo_subscription_id: row.dodoSubscriptionId,
        dodo_product_id: row.dodoProductId,
        plan_key: row.planKey,
        status: row.status,
        billing_interval: row.billingInterval,
        current_period_start: row.currentPeriodStart,
        current_period_end: row.currentPeriodEnd,
        cancel_at_period_end: row.cancelAtPeriodEnd,
        cancelled_at: row.cancelledAt,
        last_provider_event_at: row.lastProviderEventAt,
        is_current: true,
        updated_at: new Date().toISOString(),
      };
      const revocationPayload = {
        revoked_at: row.revokedAt ?? null,
        revoke_reason: row.revokeReason ?? null,
      };

      const { error } = await admin
        .from("subscriptions")
        .upsert(
          { ...payload, ...revocationPayload },
          { onConflict: "dodo_subscription_id" },
        );

      if (
        isMissingColumnError(error) &&
        row.revokedAt == null &&
        row.revokeReason == null
      ) {
        const { error: retryError } = await admin
          .from("subscriptions")
          .upsert(payload, { onConflict: "dodo_subscription_id" });
        throwIfQueryError("Failed to upsert subscription", {
          data: null,
          error: retryError,
        });
        return;
      }

      throwIfQueryError("Failed to upsert subscription", { data: null, error });
    },

    async grantLifetime(input) {
      const { data, error } = await admin.rpc("grant_lifetime_access", {
        p_event_id: input.eventId,
        p_payment_id: input.paymentId,
        p_user_id: input.userId,
        p_customer_id: input.customerId,
        p_product_id: input.productId,
        p_total_amount: input.totalAmount ?? null,
        p_currency: input.currency ?? null,
      });
      const result = throwIfQueryError("Failed to grant lifetime access", {
        data,
        error,
      });
      return result as GrantLifetimeResult;
    },

    async getPaymentFacts(paymentId) {
      const { data, error } = await admin
        .from("billing_events")
        .select("payload")
        .eq("provider", "DODO")
        .eq("event_type", "payment.succeeded")
        .filter("payload->data->>payment_id", "eq", paymentId)
        .order("received_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load payment facts", {
        data,
        error,
      });
      return row ? mapPaymentFacts(row.payload) : null;
    },

    async getLifetimeGrantByPayment(paymentId) {
      const { data, error } = await admin
        .from("lifetime_grants")
        .select("status, total_amount, currency")
        .eq("dodo_payment_id", paymentId)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load lifetime grant", {
        data,
        error,
      });
      if (!row) {
        return null;
      }
      return {
        status: row.status as "active" | "revoked",
        totalAmount: row.total_amount,
        currency: row.currency,
      };
    },

    async revokeLifetime(input) {
      const { data, error } = await admin.rpc("revoke_lifetime_access", {
        p_event_id: input.eventId,
        p_payment_id: input.paymentId,
        p_reason: input.reason,
      });
      const result = throwIfQueryError("Failed to revoke lifetime access", {
        data,
        error,
      });
      return result as RevokeLifetimeResult;
    },

    async revokeSubscription(input) {
      const { data, error } = await admin.rpc("revoke_subscription_access", {
        p_event_id: input.eventId,
        p_subscription_id: input.subscriptionId,
        p_reason: input.reason,
      });
      const result = throwIfQueryError("Failed to revoke subscription", {
        data,
        error,
      });
      return result as RevokeSubscriptionResult;
    },
  };
}

export async function loadDodoCustomerIdForUser(
  userId: string,
): Promise<string | null> {
  const store = createBillingStore();
  const current = await store.getCurrentSubscription(userId);
  return current?.dodoCustomerId ?? null;
}
