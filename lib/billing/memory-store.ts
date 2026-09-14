import type {
  BillingEventRecord,
  BillingStore,
  IncomingBillingEvent,
  StoredSubscription,
} from "@/lib/billing/types";

export function createMemoryBillingStore(seed?: {
  profileIds?: string[];
  subscriptions?: StoredSubscription[];
}): BillingStore & {
  events: Map<string, BillingEventRecord & { payload?: unknown }>;
  subscriptions: StoredSubscription[];
} {
  const profileIds = new Set(seed?.profileIds ?? []);
  const events = new Map<string, BillingEventRecord & { payload?: unknown }>();
  const subscriptions = [...(seed?.subscriptions ?? [])];

  return {
    events,
    subscriptions,
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
    async markEvent(providerEventId, status, _processingError) {
      const existing = events.get(providerEventId);
      if (existing) {
        existing.status = status;
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
  };
}
