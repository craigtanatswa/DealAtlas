import { WebhookPayloadSchema } from "@dodopayments/core/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captured = vi.hoisted(() => [] as unknown[]);
const store = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: vi.fn(async (event: unknown) => {
    captured.push(event);
  }),
}));
vi.mock("@/lib/billing/config", async () => {
  const fixtures = await import("@/lib/billing/fixtures");
  return { requirePlanProductMap: () => fixtures.BILLING_FIXTURE_PRODUCTS };
});
vi.mock("@/lib/billing/store", () => ({ createBillingStore: () => store.current }));
vi.mock("@/lib/billing/founding-db", () => ({ syncFoundingSlot: vi.fn() }));
vi.mock("@/lib/billing/reconcile", () => ({ reconcileDodoSubscription: vi.fn(async () => null) }));

import {
  BILLING_FIXTURE_USER_ID,
  billingWebhookFixtures,
  createMemoryBillingStore,
} from "@/lib/billing";
import { processVerifiedDodoWebhook } from "@/lib/billing/process";

async function deliver(payload: ReturnType<typeof billingWebhookFixtures.monthlyActive>, id: string) {
  const parsed = WebhookPayloadSchema.parse(payload);
  return processVerifiedDodoWebhook({ payload: parsed, rawBody: JSON.stringify(payload), webhookId: id });
}

describe("pro_subscribed from the Dodo webhook", () => {
  beforeEach(() => {
    captured.length = 0;
    store.current = createMemoryBillingStore({ profileIds: [BILLING_FIXTURE_USER_ID] });
  });

  it("fires once per webhook event id with plan and amount_gbp only", async () => {
    const payload = billingWebhookFixtures.monthlyActive();
    await deliver(payload, "evt_once");
    await deliver(payload, "evt_once");
    expect(captured).toHaveLength(1);
    const event = captured[0] as { distinctId: string; properties: Record<string, unknown> };
    expect(event.distinctId).toBe(BILLING_FIXTURE_USER_ID);
    expect(event.properties).toEqual({ plan: "monthly", amount_gbp: 39 });
    const serialised = JSON.stringify(event);
    for (const forbidden of ["evt_once", "sub_", "cus_", "pay_", "@", "Example Street", "SW1A"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("does not fire for renewals", async () => {
    await deliver(billingWebhookFixtures.monthlyActive(), "evt_active");
    captured.length = 0;
    await deliver(billingWebhookFixtures.renewed(), "evt_renewed");
    expect(captured).toHaveLength(0);
  });

  it("labels annual subscriptions", async () => {
    await deliver(billingWebhookFixtures.annualActive(), "evt_annual");
    expect((captured[0] as { properties: unknown }).properties).toEqual({
      plan: "annual",
      amount_gbp: expect.any(Number),
    });
  });
});
