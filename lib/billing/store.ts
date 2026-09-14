import "server-only";

import type { Database, Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BillingEventRecord,
  BillingStore,
  IncomingBillingEvent,
  StoredSubscription,
} from "@/lib/billing/types";

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type BillingEventRow = Database["public"]["Tables"]["billing_events"]["Row"];

function mapEvent(row: BillingEventRow): BillingEventRecord {
  return {
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    payloadHash: row.payload_hash,
    status: row.status,
  };
}

function mapSubscription(row: SubscriptionRow): StoredSubscription {
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
      const { data, error } = await admin
        .from("subscriptions")
        .select(
          "user_id, dodo_customer_id, dodo_subscription_id, dodo_product_id, plan_key, status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, last_provider_event_at, is_current",
        )
        .eq("dodo_subscription_id", dodoSubscriptionId)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load subscription", {
        data,
        error,
      });
      return row ? mapSubscription(row as SubscriptionRow) : null;
    },

    async getSubscriptionByCustomerId(dodoCustomerId) {
      const { data, error } = await admin
        .from("subscriptions")
        .select(
          "user_id, dodo_customer_id, dodo_subscription_id, dodo_product_id, plan_key, status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, last_provider_event_at, is_current",
        )
        .eq("dodo_customer_id", dodoCustomerId)
        .eq("is_current", true)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load subscription by customer", {
        data,
        error,
      });
      return row ? mapSubscription(row as SubscriptionRow) : null;
    },

    async getCurrentSubscription(userId) {
      const { data, error } = await admin
        .from("subscriptions")
        .select(
          "user_id, dodo_customer_id, dodo_subscription_id, dodo_product_id, plan_key, status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, last_provider_event_at, is_current",
        )
        .eq("user_id", userId)
        .eq("is_current", true)
        .maybeSingle();
      const row = throwIfQueryError("Failed to load current subscription", {
        data,
        error,
      });
      return row ? mapSubscription(row as SubscriptionRow) : null;
    },

    async upsertCurrentSubscription(row: StoredSubscription) {
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

      const { error } = await admin
        .from("subscriptions")
        .upsert(payload, { onConflict: "dodo_subscription_id" });
      throwIfQueryError("Failed to upsert subscription", { data: null, error });
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
