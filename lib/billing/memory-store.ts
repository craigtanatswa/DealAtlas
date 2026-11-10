import type {
  BillingEventRecord,
  BillingStore,
  IncomingBillingEvent,
  LifetimeGrant,
  StoredSubscription,
} from "@/lib/billing/types";

export const MEMORY_FOUNDING_CAP = 25;

export type MemoryFoundingSlot = {
  userId: string;
  status: "active" | "ended" | "released";
};

export function createMemoryBillingStore(seed?: {
  profileIds?: string[];
  subscriptions?: StoredSubscription[];
  lifetimeGrants?: LifetimeGrant[];
  foundingSlots?: MemoryFoundingSlot[];
}): BillingStore & {
  events: Map<string, BillingEventRecord & { payload?: unknown; processingError?: string | null }>;
  subscriptions: StoredSubscription[];
  lifetimeGrants: LifetimeGrant[];
  foundingSlots: MemoryFoundingSlot[];
  foundingCapFallbacks: Array<{ userId: string; paymentId: string }>;
} {
  const profileIds = new Set(seed?.profileIds ?? []);
  const events = new Map<
    string,
    BillingEventRecord & { payload?: unknown; processingError?: string | null }
  >();
  const subscriptions = [...(seed?.subscriptions ?? [])];
  const lifetimeGrants = [...(seed?.lifetimeGrants ?? [])];
  const foundingSlots = [...(seed?.foundingSlots ?? [])];
  const foundingCapFallbacks: Array<{ userId: string; paymentId: string }> = [];

  return {
    events,
    subscriptions,
    lifetimeGrants,
    foundingSlots,
    foundingCapFallbacks,
    async getEvent(providerEventId) {
      return events.get(providerEventId) ?? null;
    },
    async insertReceivedEvent(event: IncomingBillingEvent) {
      const existing = events.get(event.providerEventId);
      if (existing) {
        return { inserted: false, record: existing };
      }
      const record: BillingEventRecord = {
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        payloadHash: event.payloadHash,
        status: "RECEIVED",
      };
      events.set(event.providerEventId, { ...record, payload: event.payload });
      return { inserted: true, record };
    },
    async markEvent(providerEventId, status, processingError) {
      const existing = events.get(providerEventId);
      if (existing) {
        existing.status = status;
        existing.processingError = processingError ?? null;
      }
    },
    async profileExists(userId) {
      return profileIds.has(userId);
    },
    async getSubscriptionByDodoId(dodoSubscriptionId) {
      return (
        subscriptions.find(
          (row) => row.dodoSubscriptionId === dodoSubscriptionId,
        ) ?? null
      );
    },
    async getSubscriptionByCustomerId(dodoCustomerId) {
      return (
        subscriptions.find((row) => row.dodoCustomerId === dodoCustomerId) ??
        null
      );
    },
    async getCurrentSubscription(userId) {
      return (
        subscriptions.find((row) => row.userId === userId && row.isCurrent) ??
        null
      );
    },
    async upsertCurrentSubscription(row) {
      for (const existing of subscriptions) {
        if (existing.userId === row.userId && existing.isCurrent) {
          existing.isCurrent = false;
        }
      }
      const index = subscriptions.findIndex(
        (item) => item.dodoSubscriptionId === row.dodoSubscriptionId,
      );
      if (index >= 0) {
        subscriptions[index] = { ...row, isCurrent: true };
      } else {
        subscriptions.push({ ...row, isCurrent: true });
      }
    },
    async grantLifetime(input) {
      if (!input.eventId || !input.paymentId || !input.userId || !input.productId) {
        return "invalid";
      }
      if (lifetimeGrants.some((grant) => grant.dodoPaymentId === input.paymentId)) {
        return "duplicate";
      }
      if (
        lifetimeGrants.some(
          (grant) =>
            grant.userId === input.userId && grant.status === "active",
        )
      ) {
        return "duplicate_user";
      }
      const now = new Date().toISOString();
      lifetimeGrants.push({
        userId: input.userId,
        dodoPaymentId: input.paymentId,
        dodoCustomerId: input.customerId,
        dodoProductId: input.productId,
        status: "active",
        grantedAt: now,
        revokedAt: null,
        revokeReason: null,
        grantEventId: input.eventId,
        revokeEventId: null,
      });
      const activeSlots = foundingSlots.filter(
        (slot) => slot.status === "active",
      ).length;
      if (activeSlots < MEMORY_FOUNDING_CAP) {
        foundingSlots.push({ userId: input.userId, status: "active" });
        return "granted";
      }
      foundingCapFallbacks.push({
        userId: input.userId,
        paymentId: input.paymentId,
      });
      return "granted_over_cap";
    },
    async revokeLifetime(input) {
      if (!input.eventId || !input.paymentId) {
        return "invalid";
      }
      const grant = lifetimeGrants.find(
        (row) => row.dodoPaymentId === input.paymentId,
      );
      if (!grant) {
        return "not_found";
      }
      if (grant.status === "revoked") {
        return "already_revoked";
      }
      grant.status = "revoked";
      grant.revokedAt = new Date().toISOString();
      grant.revokeReason = input.reason;
      grant.revokeEventId = input.eventId;
      for (const slot of foundingSlots) {
        if (slot.userId === grant.userId && slot.status === "active") {
          slot.status = "ended";
        }
      }
      return "revoked";
    },
  };
}
