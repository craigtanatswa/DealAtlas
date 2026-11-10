import { isNewerProviderEvent } from "@/lib/billing/event-id";
import { isLiveSubscriptionStatus, snapshotWouldGrantPro } from "@/lib/billing/status";
import { structuredLog } from "@/lib/observability/log";
import type {
  ApplyResult,
  BillingStore,
  GrantLifetimeResult,
  IncomingBillingEvent,
  ReconcileFn,
  RevokeLifetimeResult,
  StoredSubscription,
  SubscriptionSnapshot,
} from "@/lib/billing/types";

export const DUPLICATE_SUBSCRIPTION_FLAG =
  "duplicate_subscription: user already has a live current subscription; flag for refund review.";

/** Fixed text. No ids: flags are safe to show in admin tooling. */
export const LIFETIME_OVER_CAP_FLAG =
  "lifetime_over_cap: paid after places filled; lifetime granted, review.";

export const LIFETIME_DUPLICATE_USER_FLAG =
  "lifetime_duplicate_user: user already holds lifetime access; flag for refund review.";

/** Fixed text. Must not include product ids, customer ids, or user ids. */
export const UNKNOWN_PRODUCT_ENTITLEMENT_WARNING =
  "Dodo webhook recorded a subscription whose product is outside the environment allowlist. Pro was not granted.";

function warnIfUnknownProduct(snapshot: SubscriptionSnapshot): void {
  if (snapshot.productKnown) {
    return;
  }
  structuredLog({
    level: "warn",
    msg: UNKNOWN_PRODUCT_ENTITLEMENT_WARNING,
    job: "dodo-webhook",
  });
}

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
  existing: StoredSubscription | null,
): StoredSubscription {
  // Some provider events omit the billing period; a missing value must not
  // wipe the known period of the same subscription.
  const sameSubscription = existing?.dodoSubscriptionId === snapshot.dodoSubscriptionId;
  return {
    userId,
    dodoCustomerId: snapshot.dodoCustomerId,
    dodoSubscriptionId: snapshot.dodoSubscriptionId,
    dodoProductId: snapshot.dodoProductId,
    planKey: snapshot.planKey ?? "PRO",
    status: snapshot.status,
    billingInterval: snapshot.billingInterval,
    currentPeriodStart:
      snapshot.currentPeriodStart ?? (sameSubscription ? existing.currentPeriodStart : null),
    currentPeriodEnd:
      snapshot.currentPeriodEnd ?? (sameSubscription ? existing.currentPeriodEnd : null),
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
  warnIfUnknownProduct(snapshot);
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

  // Duplicate guard (flag only): a second live subscription for the same user
  // means double billing. Plan changes keep latest-wins for is_current, so the
  // entitlement stays Pro either way; the event is flagged for follow-up.
  const current = await store.getCurrentSubscription(userId);
  const duplicate =
    wouldGrantPro(nextSnapshot) &&
    current !== null &&
    current.dodoSubscriptionId !== nextSnapshot.dodoSubscriptionId &&
    isLiveSubscriptionStatus(current.status);

  await store.upsertCurrentSubscription(
    toStored(userId, nextSnapshot, incomingTime ?? storedTime, existing ?? null),
  );
  await store.markEvent(
    event.providerEventId,
    "PROCESSED",
    duplicate ? DUPLICATE_SUBSCRIPTION_FLAG : null,
  );
  return { outcome: "applied" };
}

async function markFailedAndThrow(
  event: IncomingBillingEvent,
  store: BillingStore,
  error: unknown,
): Promise<never> {
  try {
    await store.markEvent(
      event.providerEventId,
      "FAILED",
      "lifetime grant update failed",
    );
  } catch {
    // Re-throw the original failure so the provider retries.
  }
  throw error;
}

async function applyLifetimeGrant(
  event: IncomingBillingEvent,
  store: BillingStore,
): Promise<ApplyResult> {
  const payment = event.payment;
  if (!payment || !payment.lifetime || !payment.succeeded) {
    await store.markEvent(event.providerEventId, "IGNORED");
    return { outcome: "ignored" };
  }
  if (payment.subscriptionId) {
    await store.markEvent(event.providerEventId, "IGNORED");
    return { outcome: "ignored" };
  }
  const userId = payment.userId;
  if (!userId || !(await store.profileExists(userId))) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      "No DealAtlas user could be resolved from lifetime payment metadata.",
    );
    return { outcome: "unresolved" };
  }
  const productId = payment.lifetimeProductId;
  if (!productId) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      "Lifetime product is not configured for this environment.",
    );
    return { outcome: "ignored" };
  }

  let result: GrantLifetimeResult = "invalid";
  try {
    result = await store.grantLifetime({
      eventId: event.providerEventId,
      paymentId: payment.paymentId,
      userId,
      customerId: payment.customerId,
      productId,
    });
  } catch (error) {
    await markFailedAndThrow(event, store, error);
  }

  if (result === "invalid") {
    await store.markEvent(
      event.providerEventId,
      "FAILED",
      "Lifetime grant rejected invalid input.",
    );
    throw new Error("Lifetime grant rejected invalid input.");
  }

  const processingError =
    result === "granted_over_cap"
      ? LIFETIME_OVER_CAP_FLAG
      : result === "duplicate_user"
        ? LIFETIME_DUPLICATE_USER_FLAG
        : null;

  await store.markEvent(event.providerEventId, "PROCESSED", processingError);
  return {
    outcome: result === "duplicate" ? "duplicate" : "applied",
  };
}

async function applyLifetimeReversal(
  event: IncomingBillingEvent,
  store: BillingStore,
): Promise<ApplyResult> {
  const reversal = event.reversal;
  if (!reversal) {
    await store.markEvent(event.providerEventId, "IGNORED");
    return { outcome: "ignored" };
  }

  let result: RevokeLifetimeResult = "invalid";
  try {
    result = await store.revokeLifetime({
      eventId: event.providerEventId,
      paymentId: reversal.paymentId,
      reason: reversal.kind,
    });
  } catch (error) {
    await markFailedAndThrow(event, store, error);
  }

  if (result === "invalid") {
    await store.markEvent(
      event.providerEventId,
      "FAILED",
      "Lifetime revocation rejected invalid input.",
    );
    throw new Error("Lifetime revocation rejected invalid input.");
  }
  if (result === "not_found") {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      "No lifetime grant found for the reversed payment.",
    );
    return { outcome: "ignored" };
  }

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

  if (event.reversal) {
    return applyLifetimeReversal(event, store);
  }

  if (event.payment?.lifetime && !event.payment.subscriptionId) {
    return applyLifetimeGrant(event, store);
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
