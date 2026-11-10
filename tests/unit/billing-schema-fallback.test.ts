import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type QueryError = { message: string; code?: string };
type QueryResult = { data?: unknown; error?: QueryError | null };

const state = vi.hoisted(() => ({
  select: (() => ({ data: null, error: null })) as (
    table: string,
    columns: string,
  ) => QueryResult,
  upsert: (() => ({ data: null, error: null })) as (
    table: string,
    payload: Record<string, unknown>,
  ) => QueryResult,
  update: (() => ({ data: null, error: null })) as (
    table: string,
    payload: Record<string, unknown>,
  ) => QueryResult,
  selectCalls: [] as { table: string; columns: string }[],
  upsertCalls: [] as { table: string; payload: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      let result: QueryResult = { data: null, error: null };
      const builder = {
        select(columns: string) {
          state.selectCalls.push({ table, columns });
          result = state.select(table, columns);
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(result);
        },
        update(payload: Record<string, unknown>) {
          result = state.update(table, payload);
          return builder;
        },
        upsert(payload: Record<string, unknown>) {
          state.upsertCalls.push({ table, payload });
          result = state.upsert(table, payload);
          return builder;
        },
        then(
          onFulfilled: (value: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  }),
}));

import { createBillingStore } from "@/lib/billing/store";
import type { StoredSubscription } from "@/lib/billing/types";
import { loadCurrentSubscription } from "@/lib/entitlements/store";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const SUBSCRIPTION_ROW = {
  user_id: USER_ID,
  dodo_customer_id: "cus_fixture",
  dodo_subscription_id: "sub_fixture",
  dodo_product_id: "pdt_fixture",
  plan_key: "PRO_MONTHLY",
  status: "ACTIVE",
  billing_interval: "MONTHLY",
  current_period_start: "2026-06-01T00:00:00.000Z",
  current_period_end: "2026-07-01T00:00:00.000Z",
  cancel_at_period_end: false,
  cancelled_at: null,
  last_provider_event_at: "2026-06-01T00:00:00.000Z",
  is_current: true,
};

const STORED_SUBSCRIPTION: StoredSubscription = {
  userId: USER_ID,
  dodoCustomerId: "cus_fixture",
  dodoSubscriptionId: "sub_fixture",
  dodoProductId: "pdt_fixture",
  planKey: "PRO_MONTHLY",
  status: "ACTIVE",
  billingInterval: "MONTHLY",
  currentPeriodStart: "2026-06-01T00:00:00.000Z",
  currentPeriodEnd: "2026-07-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  lastProviderEventAt: "2026-06-01T00:00:00.000Z",
  isCurrent: true,
};

function missingColumn(code: string): QueryResult {
  return {
    data: null,
    error: { message: "column does not exist", code },
  };
}

beforeEach(() => {
  state.select = () => ({ data: null, error: null });
  state.upsert = () => ({ data: null, error: null });
  state.update = () => ({ data: null, error: null });
  state.selectCalls = [];
  state.upsertCalls = [];
});

describe("entitlement subscription read before migration 0064", () => {
  it("retries without revoked_at on 42703 and maps revokedAt to null", async () => {
    state.select = (_table, columns) =>
      columns.includes("revoked_at")
        ? missingColumn("42703")
        : { data: SUBSCRIPTION_ROW, error: null };

    await expect(loadCurrentSubscription(USER_ID)).resolves.toMatchObject({
      userId: USER_ID,
      revokedAt: null,
    });
    expect(state.selectCalls).toHaveLength(2);
    expect(state.selectCalls[0]?.columns).toContain("revoked_at");
    expect(state.selectCalls[1]?.columns).not.toContain("revoked_at");
  });

  it("still throws on errors other than a missing column", async () => {
    state.select = () => ({
      data: null,
      error: { message: "database unavailable", code: "500" },
    });

    await expect(loadCurrentSubscription(USER_ID)).rejects.toThrow(
      "Failed to load subscription",
    );
    expect(state.selectCalls).toHaveLength(1);
  });
});

describe("billing subscription reads before migration 0064", () => {
  it.each([
    "getSubscriptionByDodoId",
    "getSubscriptionByCustomerId",
    "getCurrentSubscription",
  ] as const)("%s retries without revocation columns on 42703", async (method) => {
    state.select = (_table, columns) =>
      columns.includes("revoked_at")
        ? missingColumn("42703")
        : { data: SUBSCRIPTION_ROW, error: null };

    const store = createBillingStore();
    const result =
      method === "getSubscriptionByDodoId"
        ? await store.getSubscriptionByDodoId("sub_fixture")
        : method === "getSubscriptionByCustomerId"
          ? await store.getSubscriptionByCustomerId("cus_fixture")
          : await store.getCurrentSubscription(USER_ID);

    expect(result).toMatchObject({
      userId: USER_ID,
      revokedAt: null,
      revokeReason: null,
    });
    expect(state.selectCalls).toHaveLength(2);
    expect(state.selectCalls[0]?.columns).toContain("revoked_at");
    expect(state.selectCalls[1]?.columns).not.toContain("revoked_at");
  });
});

describe("billing subscription upsert before migration 0064", () => {
  it.each(["42703", "PGRST204"])(
    "retries without revocation columns on %s when the row is not revoked",
    async (code) => {
      state.select = (_table, columns) =>
        columns.includes("revoked_at")
          ? missingColumn("42703")
          : { data: null, error: null };
      state.upsert = (_table, payload) =>
        "revoked_at" in payload ? missingColumn(code) : { data: null, error: null };

      await expect(
        createBillingStore().upsertCurrentSubscription({
          ...STORED_SUBSCRIPTION,
          revokedAt: null,
          revokeReason: null,
        }),
      ).resolves.toBeUndefined();

      expect(state.upsertCalls).toHaveLength(2);
      expect(state.upsertCalls[0]?.payload).toMatchObject({
        revoked_at: null,
        revoke_reason: null,
      });
      expect(state.upsertCalls[1]?.payload).not.toHaveProperty("revoked_at");
      expect(state.upsertCalls[1]?.payload).not.toHaveProperty("revoke_reason");
    },
  );

  it.each(["42703", "PGRST204"])(
    "rethrows on %s and never drops a recorded revocation",
    async (code) => {
      state.select = () => ({ data: null, error: null });
      state.upsert = () => missingColumn(code);

      await expect(
        createBillingStore().upsertCurrentSubscription({
          ...STORED_SUBSCRIPTION,
          revokedAt: "2026-06-02T00:00:00.000Z",
          revokeReason: "refund",
        }),
      ).rejects.toThrow("Failed to upsert subscription");

      expect(state.upsertCalls).toHaveLength(1);
      expect(state.upsertCalls[0]?.payload).toMatchObject({
        revoked_at: "2026-06-02T00:00:00.000Z",
        revoke_reason: "refund",
      });
    },
  );
});
