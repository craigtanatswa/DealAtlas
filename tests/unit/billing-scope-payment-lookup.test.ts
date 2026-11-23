import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
}));

vi.mock("dodopayments", () => ({
  default: class {
    payments = { retrieve: mocks.retrieve };
  },
}));

vi.mock("@/lib/billing/config", () => ({
  requireDodoApiConfig: () => ({
    bearerToken: "test_bearer_token",
    environment: "test_mode",
  }),
  requirePlanProductMap: vi.fn(),
}));

import {
  SCOPE_PAYMENT_LOOKUP_OPTIONS,
  retrieveDodoPaymentForScope,
} from "@/lib/billing/reconcile";

describe("retrieveDodoPaymentForScope", () => {
  beforeEach(() => {
    mocks.retrieve.mockReset();
  });

  it("uses tight per-request options and maps cart product ids", async () => {
    mocks.retrieve.mockResolvedValue({
      subscription_id: "sub_test_scope",
      total_amount: 3900,
      currency: "GBP",
      product_cart: [
        { product_id: " pdt_test_monthly ", quantity: 1 },
        { product_id: "pdt_test_annual", quantity: 1 },
        { product_id: "   ", quantity: 1 },
      ],
    });

    const facts = await retrieveDodoPaymentForScope("pay_test_scope");

    expect(mocks.retrieve).toHaveBeenCalledWith("pay_test_scope", {
      timeout: 10_000,
      maxRetries: 1,
    });
    expect(SCOPE_PAYMENT_LOOKUP_OPTIONS).toEqual({
      timeout: 10_000,
      maxRetries: 1,
    });
    expect(facts).toEqual({
      subscriptionId: "sub_test_scope",
      totalAmount: 3900,
      currency: "GBP",
      productIds: ["pdt_test_monthly", "pdt_test_annual"],
    });
  });

  it("returns an empty product id list when the cart is missing", async () => {
    mocks.retrieve.mockResolvedValue({
      subscription_id: null,
      total_amount: 2500,
      currency: "GBP",
      product_cart: null,
    });

    const facts = await retrieveDodoPaymentForScope("pay_test_no_cart");

    expect(facts).toEqual({
      subscriptionId: null,
      totalAmount: 2500,
      currency: "GBP",
      productIds: [],
    });
  });
});
