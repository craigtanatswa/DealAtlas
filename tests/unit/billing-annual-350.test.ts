import { describe, expect, it } from "vitest";

import { WebhookPayloadSchema } from "@dodopayments/core/schemas";

import {
  BILLING_FIXTURE_LEGACY_PRODUCT_ID,
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_USER_ID,
  CHECKOUT_PLAN_KEYS,
  applyBillingEvent,
  billingWebhookFixtures,
  checkoutProductIds,
  createMemoryBillingStore,
  extractBillingEvent,
  isFoundingProduct,
  mapProductId,
  parseCheckoutRequest,
  selectCheckoutProduct,
  webhookAcceptedProductIds,
} from "@/lib/billing";
import { foundingSideEffect } from "@/lib/billing/founding";
import type {
  FoundingReservation,
  IncomingBillingEvent,
  PlanProductMap,
} from "@/lib/billing/types";

type FixturePayload = ReturnType<typeof billingWebhookFixtures.monthlyActive>;

const products: PlanProductMap = {
  ...BILLING_FIXTURE_PRODUCTS,
  FOUNDING_ANNUAL: "pdt_founding_annual",
};

function incoming(
  payload: FixturePayload,
  webhookId: string,
  map: PlanProductMap = products,
): IncomingBillingEvent {
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    webhookId,
    map,
  );
}

function incomingAt(
  payload: FixturePayload,
  webhookId: string,
  timestamp: string,
  map: PlanProductMap = products,
): IncomingBillingEvent {
  return incoming({ ...payload, timestamp }, webhookId, map);
}

function withData(
  payload: FixturePayload,
  overrides: Record<string, unknown>,
): FixturePayload {
  return { ...payload, data: { ...payload.data, ...overrides } };
}

function currentRow(store: ReturnType<typeof createMemoryBillingStore>) {
  return store.subscriptions.find((row) => row.isCurrent) ?? null;
}

describe("annual Pro £350 product migration", () => {
  it("maps the legacy annual product to Pro annual and keeps it out of checkout", () => {
    expect(mapProductId(BILLING_FIXTURE_LEGACY_PRODUCT_ID, products)).toMatchObject({
      planKey: "PRO_ANNUAL",
      billingInterval: "ANNUAL",
    });
    expect(isFoundingProduct(BILLING_FIXTURE_LEGACY_PRODUCT_ID, products)).toBe(
      false,
    );
    expect(checkoutProductIds(products)).not.toContain(
      BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    );
    expect(webhookAcceptedProductIds(products)).toContain(
      BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    );
  });

  it("never selects a legacy product for any checkout option", () => {
    const maps: Array<[string, PlanProductMap]> = [
      ["without founding", { ...BILLING_FIXTURE_PRODUCTS }],
      ["with founding", products],
    ];
    const reservations: FoundingReservation[] = [
      "reserved",
      "active",
      "sold_out",
      "closed",
      "unavailable",
    ];

    for (const [, map] of maps) {
      for (const planKey of CHECKOUT_PLAN_KEYS) {
        for (const founder of [true, false]) {
          for (const reservation of reservations) {
            const selection = selectCheckoutProduct({
              planKey,
              products: map,
              founder,
              reservation,
            });
            if (selection.ok) {
              expect(selection.productId).not.toBe(BILLING_FIXTURE_LEGACY_PRODUCT_ID);
            }
          }
          const withoutReservation = selectCheckoutProduct({
            planKey,
            products: map,
            founder,
            reservation: null,
          });
          if (withoutReservation.ok) {
            expect(withoutReservation.productId).not.toBe(
              BILLING_FIXTURE_LEGACY_PRODUCT_ID,
            );
          }
        }
      }
    }
  });

  it("rejects legacy product ids and tampered legacy plan keys at checkout", () => {
    expect(
      parseCheckoutRequest({
        planKey: "PRO_MONTHLY",
        productId: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
      }).ok,
    ).toBe(false);
    expect(
      parseCheckoutRequest({
        planKey: "PRO_ANNUAL",
        product_id: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
      }).ok,
    ).toBe(false);
    expect(
      parseCheckoutRequest({ planKey: "PRO_ANNUAL_LEGACY" }).ok,
    ).toBe(false);
  });

  it("grants annual Pro from the new annual product without founding", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const event = incoming(billingWebhookFixtures.annualActive(), "evt_new_annual");

    expect(await applyBillingEvent(event, store)).toEqual({ outcome: "applied" });
    expect(currentRow(store)).toMatchObject({
      planKey: "PRO_ANNUAL",
      billingInterval: "ANNUAL",
      status: "ACTIVE",
      dodoProductId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
    });
    expect(isFoundingProduct(currentRow(store)?.dodoProductId, products)).toBe(
      false,
    );
    expect(foundingSideEffect(event, products)).toBeNull();
  });

  it("grants annual Pro from the legacy annual product without founding", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const event = incoming(
      billingWebhookFixtures.annualLegacyActive(),
      "evt_legacy_annual",
    );

    expect(await applyBillingEvent(event, store)).toEqual({ outcome: "applied" });
    expect(currentRow(store)).toMatchObject({
      planKey: "PRO_ANNUAL",
      billingInterval: "ANNUAL",
      status: "ACTIVE",
      dodoProductId: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    });
    expect(isFoundingProduct(currentRow(store)?.dodoProductId, products)).toBe(
      false,
    );
    expect(foundingSideEffect(event, products)).toBeNull();
  });

  it("moves an existing monthly Pro to annual on renewed and legacy subscriptions", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });

    expect(
      await applyBillingEvent(
        incomingAt(
          billingWebhookFixtures.monthlyActive(),
          "evt_monthly_first",
          "2026-06-01T12:00:00.000Z",
        ),
        store,
      ),
    ).toEqual({ outcome: "applied" });
    expect(currentRow(store)).toMatchObject({
      planKey: "PRO_MONTHLY",
      billingInterval: "MONTHLY",
      status: "ACTIVE",
    });

    const renewed = withData(billingWebhookFixtures.renewed(), {
      product_id: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      subscription_id: "sub_annual_new",
      metadata: {
        user_id: BILLING_FIXTURE_USER_ID,
        plan_key: "PRO_ANNUAL",
      },
      payment_frequency_interval: "Year",
      subscription_period_interval: "Year",
      recurring_pre_tax_amount: 35000,
    });
    const renewedEvent = incomingAt(
      renewed,
      "evt_annual_renewed",
      "2026-07-01T12:00:00.000Z",
    );
    expect(await applyBillingEvent(renewedEvent, store)).toEqual({
      outcome: "applied",
    });
    expect(currentRow(store)).toMatchObject({
      planKey: "PRO_ANNUAL",
      billingInterval: "ANNUAL",
      status: "ACTIVE",
      dodoProductId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
    });

    const legacy = withData(billingWebhookFixtures.annualLegacyActive(), {
      subscription_id: "sub_legacy_annual",
    });
    const legacyEvent = incomingAt(
      legacy,
      "evt_legacy_after_monthly",
      "2026-07-02T12:00:00.000Z",
    );
    expect(await applyBillingEvent(legacyEvent, store)).toEqual({
      outcome: "applied",
    });

    expect(store.subscriptions.filter((row) => row.isCurrent)).toHaveLength(1);
    expect(currentRow(store)).toMatchObject({
      planKey: "PRO_ANNUAL",
      billingInterval: "ANNUAL",
      status: "ACTIVE",
      dodoProductId: BILLING_FIXTURE_LEGACY_PRODUCT_ID,
    });
    expect(isFoundingProduct(currentRow(store)?.dodoProductId, products)).toBe(
      false,
    );
    expect(foundingSideEffect(renewedEvent, products)).toBeNull();
    expect(foundingSideEffect(legacyEvent, products)).toBeNull();
  });

  it("is idempotent for repeated new and legacy annual webhooks", async () => {
    for (const [label, payload] of [
      ["new", billingWebhookFixtures.annualActive()],
      ["legacy", billingWebhookFixtures.annualLegacyActive()],
    ] as const) {
      const store = createMemoryBillingStore({
        profileIds: [BILLING_FIXTURE_USER_ID],
      });
      const webhookId = `evt_idempotent_${label}`;

      expect(await applyBillingEvent(incoming(payload, webhookId), store)).toEqual({
        outcome: "applied",
      });
      expect(await applyBillingEvent(incoming(payload, webhookId), store)).toEqual({
        outcome: "duplicate",
      });

      expect(store.events.size).toBe(1);
      expect(store.events.get(webhookId)?.status).toBe("PROCESSED");
      expect(store.subscriptions.filter((row) => row.isCurrent)).toHaveLength(1);
    }
  });

  it("fails closed and does not grant active Pro for an unknown product", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    const event = incoming(
      billingWebhookFixtures.unknownProduct(),
      "evt_unknown_product",
    );

    expect(await applyBillingEvent(event, store)).toEqual({ outcome: "applied" });
    expect(
      store.subscriptions.filter(
        (row) =>
          row.isCurrent &&
          (row.status === "ACTIVE" || row.planKey === "PRO_ANNUAL"),
      ),
    ).toEqual([]);
    expect(currentRow(store)?.planKey).not.toBe("PRO_ANNUAL");
    expect(foundingSideEffect(event, products)).toBeNull();
  });
});
