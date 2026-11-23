import { WebhookPayloadSchema } from "@dodopayments/core/schemas";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

vi.mock("server-only", () => ({}));

const getServerEnv = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/env/server", () => ({ getServerEnv }));
vi.mock("@/lib/billing/store", () => ({
  createBillingStore: () => storeState.current,
}));
vi.mock("@/lib/billing/config", async () => {
  const fixtures = await import("@/lib/billing/fixtures");
  return { requirePlanProductMap: () => fixtures.BILLING_FIXTURE_PRODUCTS };
});
vi.mock("@/lib/billing/reconcile", () => ({
  reconcileDodoSubscription: vi.fn(async () => null),
  cancelDodoSubscription: vi.fn(async () => {}),
  retrieveDodoPayment: vi.fn(async () => null),
  retrieveDodoPaymentForScope: vi.fn(async () => null),
}));
vi.mock("@/lib/billing/founding-db", () => ({
  syncFoundingSlot: vi.fn(async () => {}),
}));
vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: vi.fn(async () => {}),
}));

import {
  BILLING_FIXTURE_CUSTOMER_ID,
  BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
  BILLING_FIXTURE_PRODUCTS,
  BILLING_FIXTURE_SUBSCRIPTION_ID,
  BILLING_FIXTURE_USER_ID,
  createMemoryBillingStore,
  extractBillingEvent,
  subscriptionWebhookFixture,
} from "@/lib/billing";
import { FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE } from "@/lib/billing/product-scope";
import { processVerifiedDodoWebhook } from "@/lib/billing/process";

const FOREIGN_PRODUCT_ID = "pdt_foreign_starter";
const FOREIGN_EMAIL = "pro@example.com";
const FOREIGN_NAME = "Pro User";
const FOREIGN_PAYMENT_ID = "pay_dealatlas_fixture";

type MemoryStore = ReturnType<typeof createMemoryBillingStore>;
type WebhookFixture = ReturnType<typeof subscriptionWebhookFixture>;

function foreignPayload(): WebhookFixture {
  return subscriptionWebhookFixture("subscription.active", {
    product_id: FOREIGN_PRODUCT_ID,
  });
}

function extractEvent(payload: WebhookFixture, webhookId: string) {
  return extractBillingEvent(
    WebhookPayloadSchema.parse(payload),
    JSON.stringify(payload),
    webhookId,
    BILLING_FIXTURE_PRODUCTS,
  );
}

async function deliver(payload: WebhookFixture, webhookId: string) {
  return processVerifiedDodoWebhook({
    payload: WebhookPayloadSchema.parse(payload),
    rawBody: JSON.stringify(payload),
    webhookId,
  });
}

async function seedEvent(
  store: MemoryStore,
  status: "RECEIVED" | "FAILED" | "PROCESSED" | "IGNORED",
  webhookId: string,
) {
  const event = extractEvent(foreignPayload(), webhookId);
  await store.insertReceivedEvent(event);
  if (status !== "RECEIVED") {
    await store.markEvent(
      event.providerEventId,
      status,
      status === "IGNORED" ? "pre-existing ignored note" : null,
    );
  }
  return event;
}

function assertNoForeignIdentifiers(value: unknown): void {
  const serialised = JSON.stringify(value);
  for (const identifier of [
    FOREIGN_EMAIL,
    FOREIGN_NAME,
    BILLING_FIXTURE_CUSTOMER_ID,
    BILLING_FIXTURE_SUBSCRIPTION_ID,
    BILLING_FIXTURE_USER_ID,
    FOREIGN_PAYMENT_ID,
    FOREIGN_PRODUCT_ID,
  ]) {
    expect(serialised).not.toContain(identifier);
  }
}

describe("processVerifiedDodoWebhook foreign payload strip", () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    getServerEnv.mockReset();
    getServerEnv.mockReturnValue({
      DODO_PRO_MONTHLY_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
      DODO_PRO_ANNUAL_PRODUCT_ID: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      DODO_PRO_ANNUAL_LEGACY_PRODUCT_IDS:
        BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL_LEGACY.join(","),
      DODO_FOUNDING_LIFETIME_PRODUCT_ID: BILLING_FIXTURE_LIFETIME_PRODUCT_ID,
    });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["FAILED", "RECEIVED"] as const)(
    "strips the stored payload of an earlier %s delivery",
    async (status) => {
      const store = createMemoryBillingStore();
      storeState.current = store;
      const webhookId = `evt_foreign_${status.toLowerCase()}`;
      const event = await seedEvent(store, status, webhookId);
      expect(store.events.get(event.providerEventId)?.payload).toEqual(
        event.payload,
      );

      const result = await deliver(foreignPayload(), webhookId);

      expect(result).toEqual({ outcome: "ignored" });
      const row = store.events.get(event.providerEventId);
      expect(row?.status).toBe("IGNORED");
      expect(row?.payload).toEqual({});
      expect(row?.processingError).toBe(FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE);
      expect(row?.providerEventId).toBe(event.providerEventId);
      expect(row?.eventType).toBe(event.eventType);
      expect(row?.payloadHash).toBe(event.payloadHash);
      assertNoForeignIdentifiers(row);
    },
  );

  it("is a no-op on the second retry once the row is stripped", async () => {
    const store = createMemoryBillingStore();
    storeState.current = store;
    const webhookId = "evt_foreign_twice";
    const event = await seedEvent(store, "FAILED", webhookId);

    expect(await deliver(foreignPayload(), webhookId)).toEqual({
      outcome: "ignored",
    });
    const afterFirst = structuredClone(store.events.get(event.providerEventId));
    expect(afterFirst?.status).toBe("IGNORED");

    const strip = vi.spyOn(store, "stripForeignEventPayload");
    expect(await deliver(foreignPayload(), webhookId)).toEqual({
      outcome: "ignored",
    });

    expect(strip).toHaveBeenCalledTimes(1);
    expect(await strip.mock.results[0]?.value).toBe(false);
    expect(store.events.get(event.providerEventId)).toEqual(afterFirst);
  });

  it("writes nothing when a foreign event has no prior row", async () => {
    const store = createMemoryBillingStore();
    storeState.current = store;
    const writeSpies = [
      vi.spyOn(store, "insertReceivedEvent"),
      vi.spyOn(store, "markEvent"),
      vi.spyOn(store, "upsertCurrentSubscription"),
      vi.spyOn(store, "grantLifetime"),
      vi.spyOn(store, "revokeLifetime"),
      vi.spyOn(store, "revokeSubscription"),
    ];
    const strip = vi.spyOn(store, "stripForeignEventPayload");

    const result = await deliver(foreignPayload(), "evt_foreign_new");

    expect(result).toEqual({ outcome: "ignored" });
    for (const spy of writeSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(store.events.size).toBe(0);
    expect(strip).toHaveBeenCalledTimes(1);
    expect(await strip.mock.results[0]?.value).toBe(false);
  });

  it("leaves an allowlisted event and its payload untouched", async () => {
    const store = createMemoryBillingStore({
      profileIds: [BILLING_FIXTURE_USER_ID],
    });
    storeState.current = store;
    const strip = vi.spyOn(store, "stripForeignEventPayload");
    const payload = subscriptionWebhookFixture("subscription.active", {
      product_id: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
    });
    const event = extractEvent(payload, "evt_ours_payload");

    const result = await deliver(payload, "evt_ours_payload");

    expect(result).toEqual({ outcome: "applied" });
    const row = store.events.get(event.providerEventId);
    expect(row?.status).toBe("PROCESSED");
    expect(row?.payload).toEqual(event.payload);
    expect(strip).not.toHaveBeenCalled();
  });

  it.each(["PROCESSED", "IGNORED"] as const)(
    "never modifies a pre-existing %s row for a now-foreign event",
    async (status) => {
      const store = createMemoryBillingStore();
      storeState.current = store;
      const webhookId = `evt_foreign_terminal_${status.toLowerCase()}`;
      const event = await seedEvent(store, status, webhookId);
      const before = structuredClone(store.events.get(event.providerEventId));

      const result = await deliver(foreignPayload(), webhookId);

      expect(result).toEqual({ outcome: "ignored" });
      const row = store.events.get(event.providerEventId);
      expect(row).toEqual(before);
      expect(row?.status).toBe(status);
      expect(row?.payload).toEqual(event.payload);
    },
  );

  it("acknowledges a strip failure and logs a redacted warn", async () => {
    const store = createMemoryBillingStore();
    storeState.current = store;
    const webhookId = "evt_foreign_strip_fail";
    const event = await seedEvent(store, "RECEIVED", webhookId);
    const strip = vi
      .spyOn(store, "stripForeignEventPayload")
      .mockRejectedValueOnce(
        new Error(`database failed for ${FOREIGN_PRODUCT_ID} ${FOREIGN_EMAIL}`),
      );

    const result = await deliver(foreignPayload(), webhookId);

    expect(result).toEqual({ outcome: "ignored" });
    expect(strip).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.map(
      (call) => JSON.parse(String(call[0])) as Record<string, unknown>,
    );
    const failed = logged.find(
      (entry) => entry.event === "dodo_webhook_foreign_strip_failed",
    );
    expect(failed).toBeDefined();
    expect(failed?.level).toBe("warn");
    expect(failed?.msg).toBe(
      "Could not remove a stored foreign Dodo event payload; review billing_events.",
    );
    expect(failed?.eventType).toBe("subscription.active");
    expect(failed?.job).toBe("dodo-webhook");
    expect(Object.keys(failed ?? {}).sort()).toEqual(
      ["event", "eventType", "job", "level", "msg", "ts"].sort(),
    );
    assertNoForeignIdentifiers(failed);
    expect(store.events.get(event.providerEventId)?.status).toBe("RECEIVED");
    expect(store.events.get(event.providerEventId)?.payload).toEqual(
      event.payload,
    );
  });
});

describe("memory billing store stripForeignEventPayload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["RECEIVED", "FAILED"] as const)(
    "strips a %s row and keeps its identity fields",
    async (status) => {
      const store = createMemoryBillingStore();
      const event = await seedEvent(
        store,
        status,
        `evt_store_${status.toLowerCase()}`,
      );

      expect(
        await store.stripForeignEventPayload(
          event.providerEventId,
          FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE,
        ),
      ).toBe(true);

      expect(store.events.get(event.providerEventId)).toMatchObject({
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        payloadHash: event.payloadHash,
        payload: {},
        status: "IGNORED",
        processingError: FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE,
      });
    },
  );

  it("is idempotent and returns false on a second call", async () => {
    const store = createMemoryBillingStore();
    const event = await seedEvent(store, "FAILED", "evt_store_idempotent");
    const note = FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE;

    expect(await store.stripForeignEventPayload(event.providerEventId, note)).toBe(
      true,
    );
    expect(await store.stripForeignEventPayload(event.providerEventId, note)).toBe(
      false,
    );
  });

  it.each(["PROCESSED", "IGNORED"] as const)(
    "leaves a %s row untouched",
    async (status) => {
      const store = createMemoryBillingStore();
      const event = await seedEvent(
        store,
        status,
        `evt_store_${status.toLowerCase()}`,
      );
      const before = structuredClone(store.events.get(event.providerEventId));

      expect(
        await store.stripForeignEventPayload(
          event.providerEventId,
          FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE,
        ),
      ).toBe(false);
      expect(store.events.get(event.providerEventId)).toEqual(before);
      expect(store.events.get(event.providerEventId)?.payload).toEqual(
        event.payload,
      );
      expect(store.events.get(event.providerEventId)?.status).toBe(status);
    },
  );

  it("returns false for an unknown event id", async () => {
    const store = createMemoryBillingStore();

    expect(
      await store.stripForeignEventPayload(
        "evt_store_missing",
        FOREIGN_EVENT_PAYLOAD_STRIPPED_NOTE,
      ),
    ).toBe(false);
    expect(store.events.size).toBe(0);
  });
});
