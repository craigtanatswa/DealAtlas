import { describe, expect, it } from "vitest";

import {
  BILLING_FIXTURE_PRODUCTS,
  mapPlanKey,
  mapProductId,
  parseCheckoutRequest,
} from "@/lib/billing";

describe("checkout plan allowlist", () => {
  it("maps monthly and annual plan keys to environment product IDs", () => {
    expect(mapPlanKey("PRO_MONTHLY", BILLING_FIXTURE_PRODUCTS)).toEqual({
      planKey: "PRO_MONTHLY",
      productId: BILLING_FIXTURE_PRODUCTS.PRO_MONTHLY,
      billingInterval: "MONTHLY",
    });
    expect(mapPlanKey("PRO_ANNUAL", BILLING_FIXTURE_PRODUCTS)).toEqual({
      planKey: "PRO_ANNUAL",
      productId: BILLING_FIXTURE_PRODUCTS.PRO_ANNUAL,
      billingInterval: "ANNUAL",
    });
  });

  it("rejects browser-supplied product IDs and user IDs", () => {
    expect(
      parseCheckoutRequest({
        planKey: "PRO_MONTHLY",
        productId: "pdt_attacker",
      }).ok,
    ).toBe(false);
    expect(
      parseCheckoutRequest({
        planKey: "PRO_MONTHLY",
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }).ok,
    ).toBe(false);
    expect(parseCheckoutRequest({ planKey: "PRO_MONTHLY" })).toEqual({
      ok: true,
      planKey: "PRO_MONTHLY",
    });
  });

  it("ignores returnTo in the plan-key parser and keeps product IDs server-mapped", () => {
    expect(
      parseCheckoutRequest({
        planKey: "PRO_MONTHLY",
        returnTo: "/app/deals/22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      ok: true,
      planKey: "PRO_MONTHLY",
    });
  });

  it("does not map unknown product IDs", () => {
    expect(mapProductId("pdt_other", BILLING_FIXTURE_PRODUCTS)).toBeNull();
  });
});
