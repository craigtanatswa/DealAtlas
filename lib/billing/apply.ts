import { isNewerProviderEvent } from "@/lib/billing/event-id";
import { snapshotWouldGrantPro } from "@/lib/billing/status";
import type {
  ApplyResult,
  BillingStore,
  IncomingBillingEvent,
  ReconcileFn,
  StoredSubscription,
  SubscriptionSnapshot,
} from "@/lib/billing/types";

const TERMINAL_EVENT_STATUSES = new Set(["PROCESSED", "IGNORED"]);

function wouldGrantPro(snapshot: SubscriptionSnapshot): boolean {
  return snapshot.productKnown && snapshotWouldGrantPro(snapshot.status);
}

async function resolveUserId(
  snapshot: SubscriptionSnapshot,
  store: BillingStore,
): Promise<string | null> {
  if (snapshot.userId && (await store.profileExists(snapshot.userId))) {
    return snapshot.userId;
  }

  const bySubscription = await store.getSubscriptionByDodoId(
    snapshot.dodoSubscriptionId,
  );
  if (bySubscription) {
    return bySubscription.userId;
  }

  const byCustomer = await store.getSubscriptionByCustomerId(
    snapshot.dodoCustomerId,
  );
  return byCustomer?.userId ?? null;
}

function toStored(
  userId: string,
  snapshot: SubscriptionSnapshot,
  occurredAt: string | null,
): StoredSubscription {
  return {
    userId,
    dodoCustomerId: snapshot.dodoCustomerId,
    dodoSubscriptionId: snapshot.dodoSubscriptionId,
    dodoProductId: snapshot.dodoProductId,
    planKey: snapshot.planKey ?? "PRO",
    status: snapshot.status,
    billingInterval: snapshot.billingInterval,
    currentPeriodStart: snapshot.currentPeriodStart,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    cancelledAt: snapshot.cancelledAt,
    lastProviderEventAt: occurredAt,
    isCurrent: true,
  };
}

async function applySnapshot(
  event: IncomingBillingEvent,
  snapshot: SubscriptionSnapshot,
  store: BillingStore,
  reconcile?: ReconcileFn,
): Promise<ApplyResult> {
  const userId = await resolveUserId(snapshot, store);
  if (!userId) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      "No DealAtlas user could be resolved from metadata or existing subscriptions.",
    );
    return { outcome: "unresolved" };
  }

  const existing =
    (await store.getSubscriptionByDodoId(snapshot.dodoSubscriptionId)) ??
    (await store.getCurrentSubscription(userId));

  const incomingTime = event.occurredAt;
  const storedTime = existing?.lastProviderEventAt ?? null;
  const newer = isNewerProviderEvent(incomingTime, storedTime);

  if (existing && !newer) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      "Older than the last applied provider event.",
    );
    return { outcome: "stale" };
  }

  let nextSnapshot = snapshot;
  const ambiguousGrant = wouldGrantPro(snapshot) && incomingTime == null;
  if (ambiguousGrant && reconcile) {
    const reconciled = await reconcile(snapshot.dodoSubscriptionId);
    if (reconciled) {
      nextSnapshot = reconciled;
    } else {
      await store.markEvent(
        event.providerEventId,
        "IGNORED",
        "Ambiguous grant without a reconcilable provider subscription.",
      );
      return { outcome: "unresolved" };
    }
  }

  await store.upsertCurrentSubscription(
    toStored(userId, nextSnapshot, incomingTime ?? storedTime),
  );
  await store.markEvent(event.providerEventId, "PROCESSED");
  return { outcome: "applied" };
}

async function applyPayment(
  event: IncomingBillingEvent,
  store: BillingStore,
  reconcile?: ReconcileFn,
): Promise<ApplyResult> {
  const payment = event.payment;
  if (!payment) {
    await store.markEvent(event.providerEventId, "IGNORED", "Payment payload missing.");
    return { outcome: "ignored" };
  }

  if (!payment.succeeded || !payment.subscriptionId) {
    await store.markEvent(event.providerEventId, "PROCESSED");
    return { outcome: "ignored" };
  }

  const existing = await store.getSubscriptionByDodoId(payment.subscriptionId);
  if (!existing || existing.status !== "ON_HOLD") {
    await store.markEvent(event.providerEventId, "PROCESSED");
    return { outcome: "ignored" };
  }

  if (!reconcile) {
    await store.markEvent(event.providerEventId, "PROCESSED");
    return { outcome: "ignored" };
  }

  const reconciled = await reconcile(payment.subscriptionId);
  if (!reconciled) {
    await store.markEvent(event.providerEventId, "PROCESSED");
    return { outcome: "ignored" };
  }

  return applySnapshot(
    {
      ...event,
      occurredAt: event.occurredAt ?? reconciled.currentPeriodStart,
      subscription: reconciled,
    },
    reconciled,
    store,
  );
}

export async function applyBillingEvent(
  event: IncomingBillingEvent,
  store: BillingStore,
  options: { reconcile?: ReconcileFn } = {},
): Promise<ApplyResult> {
  const existingEvent = await store.getEvent(event.providerEventId);
  if (existingEvent && TERMINAL_EVENT_STATUSES.has(existingEvent.status)) {
    return { outcome: "duplicate" };
  }

  if (!existingEvent) {
    const inserted = await store.insertReceivedEvent(event);
    if (
      !inserted.inserted &&
      TERMINAL_EVENT_STATUSES.has(inserted.record.status)
    ) {
      return { outcome: "duplicate" };
    }
  }

  if (event.subscription) {
    return applySnapshot(event, event.subscription, store, options.reconcile);
  }

  if (event.payment) {
    return applyPayment(event, store, options.reconcile);
  }

  await store.markEvent(
    event.providerEventId,
    "IGNORED",
    `Unhandled event type ${event.eventType}.`,
  );
  return { outcome: "ignored" };
}
