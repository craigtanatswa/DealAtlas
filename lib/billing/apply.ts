import { isNewerProviderEvent } from "@/lib/billing/event-id";
import { classifyRefund } from "@/lib/billing/refund";
import { isLiveSubscriptionStatus, snapshotWouldGrantPro } from "@/lib/billing/status";
import { structuredLog } from "@/lib/observability/log";
import type {
  ApplyResult,
  BillingStore,
  CancelSubscriptionFn,
  GrantLifetimeResult,
  IncomingBillingEvent,
  PaymentFacts,
  ReconcileFn,
  RetrievePaymentFn,
  RevokeLifetimeResult,
  RevokeSubscriptionResult,
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

export const DISPUTE_LOG_ONLY_NOTE =
  "dispute_log_only: dispute opened or challenged; lifetime access unchanged.";

export const DISPUTE_NO_ACTION_NOTE =
  "dispute_no_action: dispute resolved without changing lifetime access.";

export const LIFETIME_PARTIAL_REFUND_NOTE =
  "lifetime_partial_refund: partial refund; lifetime access kept.";

export const LIFETIME_REFUND_REVIEW_FLAG =
  "lifetime_refund_amount_unknown: refund amount could not be compared with the payment total; access kept, review.";

export const SUBSCRIPTION_PARTIAL_REFUND_NOTE =
  "subscription_partial_refund: partial refund; Pro access kept.";

export const SUBSCRIPTION_REFUND_REVIEW_FLAG =
  "subscription_refund_amount_unknown: refund amount could not be compared with the payment total; access kept, review.";

export const SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG =
  "subscription_reversal_unresolved: reversed payment could not be mapped to a subscription; access kept, review.";

export const SUBSCRIPTION_CANCEL_FAILED_FLAG =
  "subscription_cancel_failed: local revocation applied but the provider cancellation failed; review.";

export const SUBSCRIPTION_ALREADY_REVOKED_NOTE =
  "subscription_already_revoked: subscription is already revoked; no further action.";

export const SUBSCRIPTION_REVOKED_TERMINAL_NOTE =
  "subscription_revoked_terminal: subscription is revoked; provider event cannot re-grant Pro.";

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
    revokedAt: sameSubscription ? existing.revokedAt ?? null : null,
    revokeReason: sameSubscription ? existing.revokeReason ?? null : null,
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

  // A revoke is terminal for the same provider subscription id. A brand-new
  // subscription id after re-subscribing is intentionally not matched here.
  if (
    existing &&
    existing.dodoSubscriptionId === snapshot.dodoSubscriptionId &&
    existing.revokedAt
  ) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      SUBSCRIPTION_REVOKED_TERMINAL_NOTE,
    );
    return { outcome: "ignored" };
  }

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
      totalAmount: payment.totalAmount,
      currency: payment.currency,
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

async function resolveReversalPayment(
  event: IncomingBillingEvent,
  store: BillingStore,
  retrievePayment: RetrievePaymentFn | undefined,
): Promise<PaymentFacts | null> {
  const paymentId = event.reversal?.paymentId ?? event.disputeNotice?.paymentId;
  if (!paymentId) {
    return null;
  }

  const local = await store.getPaymentFacts(paymentId);
  if (local?.subscriptionId) {
    return local;
  }

  if (retrievePayment) {
    try {
      const remote = await retrievePayment(paymentId);
      if (remote) {
        return remote;
      }
    } catch {
      // A provider lookup failure must never reject the webhook. Fall through
      // to whatever we already know locally.
    }
  }

  return local;
}

async function markReversalUnresolved(
  event: IncomingBillingEvent,
  store: BillingStore,
): Promise<ApplyResult> {
  structuredLog({
    level: "warn",
    msg: SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG,
    job: "dodo-webhook",
  });
  await store.markEvent(
    event.providerEventId,
    "PROCESSED",
    SUBSCRIPTION_REVERSAL_UNRESOLVED_FLAG,
  );
  return { outcome: "ignored" };
}

async function cancelRevokedSubscription(
  event: IncomingBillingEvent,
  store: BillingStore,
  subscription: StoredSubscription,
  cancelSubscription: CancelSubscriptionFn | undefined,
): Promise<ApplyResult> {
  if (!cancelSubscription || !subscription.dodoSubscriptionId) {
    await store.markEvent(event.providerEventId, "PROCESSED");
    return { outcome: "applied" };
  }

  try {
    await cancelSubscription(subscription.dodoSubscriptionId);
    await store.markEvent(event.providerEventId, "PROCESSED");
    return { outcome: "applied" };
  } catch {
    // Local revocation is already durable. Never throw: a non-2xx would make
    // the provider redeliver forever, and the subscription row already being
    // revoked prevents a second cancel attempt.
    structuredLog({
      level: "warn",
      msg: SUBSCRIPTION_CANCEL_FAILED_FLAG,
      job: "dodo-webhook",
    });
    await store.markEvent(
      event.providerEventId,
      "PROCESSED",
      SUBSCRIPTION_CANCEL_FAILED_FLAG,
    );
    return { outcome: "applied" };
  }
}

async function revokeSubscriptionAccess(
  event: IncomingBillingEvent,
  store: BillingStore,
  subscription: StoredSubscription,
  subscriptionId: string,
  reason: string,
  cancelSubscription: CancelSubscriptionFn | undefined,
): Promise<ApplyResult> {
  let result: RevokeSubscriptionResult = "invalid";
  try {
    result = await store.revokeSubscription({
      eventId: event.providerEventId,
      subscriptionId,
      reason,
    });
  } catch (error) {
    await markFailedAndThrow(event, store, error);
  }

  if (result === "invalid") {
    await store.markEvent(
      event.providerEventId,
      "FAILED",
      "Subscription revocation rejected invalid input.",
    );
    throw new Error("Subscription revocation rejected invalid input.");
  }
  if (result === "not_found") {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      "No subscription found for the reversed payment.",
    );
    return { outcome: "ignored" };
  }
  if (result === "already_revoked") {
    await store.markEvent(
      event.providerEventId,
      "PROCESSED",
      SUBSCRIPTION_ALREADY_REVOKED_NOTE,
    );
    return { outcome: "ignored" };
  }

  return cancelRevokedSubscription(
    event,
    store,
    subscription,
    cancelSubscription,
  );
}

async function applySubscriptionReversal(
  event: IncomingBillingEvent,
  store: BillingStore,
  reversal: NonNullable<IncomingBillingEvent["reversal"]>,
  cancelSubscription: CancelSubscriptionFn | undefined,
  retrievePayment: RetrievePaymentFn | undefined,
): Promise<ApplyResult> {
  const payment = await resolveReversalPayment(event, store, retrievePayment);
  const subscriptionId = payment?.subscriptionId ?? null;
  if (!subscriptionId) {
    return markReversalUnresolved(event, store);
  }

  const subscription = await store.getSubscriptionByDodoId(subscriptionId);
  if (!subscription) {
    return markReversalUnresolved(event, store);
  }

  if (reversal.kind === "refund") {
    const classification = classifyRefund({
      refundAmount: reversal.refundAmount,
      refundCurrency: reversal.refundCurrency,
      isPartial: reversal.isPartial,
      paidTotal: payment?.totalAmount ?? null,
      paidCurrency: payment?.currency ?? null,
    });

    if (classification === "partial") {
      structuredLog({
        level: "info",
        msg: SUBSCRIPTION_PARTIAL_REFUND_NOTE,
        job: "dodo-webhook",
      });
      await store.markEvent(
        event.providerEventId,
        "PROCESSED",
        SUBSCRIPTION_PARTIAL_REFUND_NOTE,
      );
      return { outcome: "ignored" };
    }

    if (classification === "unknown") {
      structuredLog({
        level: "warn",
        msg: SUBSCRIPTION_REFUND_REVIEW_FLAG,
        job: "dodo-webhook",
      });
      await store.markEvent(
        event.providerEventId,
        "PROCESSED",
        SUBSCRIPTION_REFUND_REVIEW_FLAG,
      );
      return { outcome: "ignored" };
    }
  }

  return revokeSubscriptionAccess(
    event,
    store,
    subscription,
    subscriptionId,
    reversal.kind,
    cancelSubscription,
  );
}

async function applyReversal(
  event: IncomingBillingEvent,
  store: BillingStore,
  cancelSubscription: CancelSubscriptionFn | undefined,
  retrievePayment: RetrievePaymentFn | undefined,
): Promise<ApplyResult> {
  if (event.disputeNotice) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      DISPUTE_LOG_ONLY_NOTE,
    );
    return { outcome: "ignored" };
  }

  const reversal = event.reversal;
  if (!reversal) {
    await store.markEvent(event.providerEventId, "IGNORED");
    return { outcome: "ignored" };
  }

  const grant = await store.getLifetimeGrantByPayment(reversal.paymentId);
  if (!grant) {
    return applySubscriptionReversal(
      event,
      store,
      reversal,
      cancelSubscription,
      retrievePayment,
    );
  }

  if (reversal.kind === "refund") {
    const classification = classifyRefund({
      refundAmount: reversal.refundAmount,
      refundCurrency: reversal.refundCurrency,
      isPartial: reversal.isPartial,
      paidTotal: grant.totalAmount,
      paidCurrency: grant.currency,
    });

    if (classification === "partial") {
      structuredLog({
        level: "info",
        msg: LIFETIME_PARTIAL_REFUND_NOTE,
        job: "dodo-webhook",
      });
      await store.markEvent(
        event.providerEventId,
        "PROCESSED",
        LIFETIME_PARTIAL_REFUND_NOTE,
      );
      return { outcome: "ignored" };
    }

    if (classification === "unknown") {
      structuredLog({
        level: "warn",
        msg: LIFETIME_REFUND_REVIEW_FLAG,
        job: "dodo-webhook",
      });
      await store.markEvent(
        event.providerEventId,
        "PROCESSED",
        LIFETIME_REFUND_REVIEW_FLAG,
      );
      return { outcome: "ignored" };
    }
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
  options: {
    reconcile?: ReconcileFn;
    cancelSubscription?: CancelSubscriptionFn;
    retrievePayment?: RetrievePaymentFn;
  } = {},
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

  if (event.reversal || event.disputeNotice) {
    return applyReversal(
      event,
      store,
      options.cancelSubscription,
      options.retrievePayment,
    );
  }

  if (
    event.eventType === "dispute.won" ||
    event.eventType === "dispute.cancelled" ||
    event.eventType === "dispute.expired"
  ) {
    await store.markEvent(
      event.providerEventId,
      "IGNORED",
      DISPUTE_NO_ACTION_NOTE,
    );
    return { outcome: "ignored" };
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
