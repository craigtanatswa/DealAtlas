import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppProfile } from "@/lib/auth/types";
import type { PlanProductMap } from "@/lib/billing/types";

// Real isProAnnualEnabled(); only the server env it reads is faked.
const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  reserveFoundingSlot: vi.fn(),
  hasLiveSubscription: vi.fn(),
  requireDodoCheckoutConfig: vi.fn(),
  checkoutHandler: vi.fn(),
  Checkout: vi.fn(),
  sessions: [] as Array<{ product_cart: Array<{ product_id: string }> }>,
  products: {
    PRO_MONTHLY: "pdt_test_monthly",
    PRO_ANNUAL: "pdt_test_annual",
    PRO_ANNUAL_LEGACY: [],
    FOUNDING_ANNUAL: "pdt_test_founding",
  } as PlanProductMap,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => mocks.env }));
vi.mock("@/lib/billing/founding-db", () => ({
  readFoundingMember: vi.fn(async () => false),
  reserveFoundingSlot: mocks.reserveFoundingSlot,
}));
vi.mock("@/lib/billing/live-subscription", () => ({
  hasLiveSubscription: mocks.hasLiveSubscription,
}));
vi.mock("@/lib/billing/config", () => ({
  requireDodoCheckoutConfig: mocks.requireDodoCheckoutConfig,
}));
vi.mock("@dodopayments/nextjs", () => ({ Checkout: mocks.Checkout }));

import { createAuthenticatedCheckoutResponse } from "@/lib/billing/checkout";
import { isProAnnualEnabled } from "@/lib/billing/annual-enabled";
import { DISPLAY_PRICING } from "@/lib/constants";

const USER = {
  id: "user_test",
  email: "buyer@example.com",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
};
const PROFILE: AppProfile = {
  id: USER.id,
  email: USER.email,
  display_name: "Test Buyer",
  role: "USER",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const ON = { DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_test_annual", SHOW_ANNUAL: "true" };
const OFF_STATES: Array<[string, Record<string, string | undefined>]> = [
  ["SHOW_ANNUAL unset", { DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_test_annual" }],
  ["SHOW_ANNUAL=false", { DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_test_annual", SHOW_ANNUAL: "false" }],
  ["SHOW_ANNUAL=TRUE (not exact)", { DODO_PRO_ANNUAL_PRODUCT_ID: "pdt_test_annual", SHOW_ANNUAL: "TRUE" }],
  ["product id unset", { SHOW_ANNUAL: "true" }],
  ["product id blank", { DODO_PRO_ANNUAL_PRODUCT_ID: "  ", SHOW_ANNUAL: "true" }],
];

function json(body: unknown) {
  return new NextRequest("https://www.dealatlas.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
}

function form(body: Record<string, string>) {
  return new NextRequest("https://www.dealatlas.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

function checkout(request: NextRequest) {
  return createAuthenticatedCheckoutResponse({ request, user: USER, profile: PROFILE });
}

function soldProduct(): string | undefined {
  return mocks.sessions.at(-1)?.product_cart[0]?.product_id;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions.length = 0;
  mocks.env = { ...ON };
  mocks.reserveFoundingSlot.mockResolvedValue("reserved");
  mocks.hasLiveSubscription.mockResolvedValue(false);
  mocks.requireDodoCheckoutConfig.mockReturnValue({
    bearerToken: "dodo_test_api_key",
    environment: "test_mode",
    returnUrl: "https://www.dealatlas.example/checkout/success",
    products: mocks.products,
  });
  mocks.checkoutHandler.mockImplementation(async (request: Request) => {
    mocks.sessions.push(await request.json());
    return new Response(JSON.stringify({ checkout_url: "https://checkout.example/x" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  mocks.Checkout.mockImplementation(() => mocks.checkoutHandler);
});

describe("isProAnnualEnabled", () => {
  it("is true only with a product id AND SHOW_ANNUAL=true", () => {
    expect(isProAnnualEnabled(ON)).toBe(true);
    for (const [, env] of OFF_STATES) {
      expect(isProAnnualEnabled(env)).toBe(false);
    }
  });

  it("reads the server env by default and fails closed if it cannot", () => {
    mocks.env = { ...ON };
    expect(isProAnnualEnabled()).toBe(true);
    mocks.env = {};
    expect(isProAnnualEnabled()).toBe(false);
  });
});

describe.each(OFF_STATES)("checkout with annual off (%s)", (_label, env) => {
  beforeEach(() => {
    mocks.env = { ...env };
  });

  it("rejects a JSON annual checkout with a generic 400 before any Dodo call", async () => {
    const response = await checkout(json({ planKey: "PRO_ANNUAL" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: "Choose a DealAtlas Pro plan.",
      message: "Choose a DealAtlas Pro plan.",
      code: "INVALID_PLAN",
    });
    expect(JSON.stringify(body)).not.toMatch(/annual|SHOW_ANNUAL|pdt_/i);
    expect(mocks.requireDodoCheckoutConfig).not.toHaveBeenCalled();
    expect(mocks.Checkout).not.toHaveBeenCalled();
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
    expect(mocks.hasLiveSubscription).not.toHaveBeenCalled();
  });

  it("rejects a form-post annual checkout the same way", async () => {
    const response = await checkout(form({ planKey: "PRO_ANNUAL", returnTo: "/pricing" }));
    expect(response.status).toBe(400);
    expect(mocks.Checkout).not.toHaveBeenCalled();
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
  });

  it("still sells Pro monthly", async () => {
    const response = await checkout(json({ planKey: "PRO_MONTHLY" }));
    expect(response.status).toBe(200);
    expect(soldProduct()).toBe(mocks.products.PRO_MONTHLY);
  });

  it("still sells Founding", async () => {
    const response = await checkout(json({ planKey: "FOUNDING" }));
    expect(response.status).toBe(200);
    expect(soldProduct()).toBe(mocks.products.FOUNDING_ANNUAL);
  });

  it("points a full founding offer at Pro monthly, not annual", async () => {
    mocks.reserveFoundingSlot.mockResolvedValue("sold_out");
    const response = await checkout(json({ planKey: "FOUNDING" }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("FOUNDING_CAP_FULL");
    expect(body.message).toContain(`Pro monthly at ${DISPLAY_PRICING.proMonthly}`);
    expect(body.message).not.toMatch(/annual|£350/i);
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
  });
});

describe("checkout with annual on", () => {
  it("sells Pro annual with the annual product", async () => {
    const response = await checkout(json({ planKey: "PRO_ANNUAL" }));
    expect(response.status).toBe(200);
    expect(soldProduct()).toBe(mocks.products.PRO_ANNUAL);
  });

  it("sells Pro monthly and Founding unchanged", async () => {
    expect((await checkout(json({ planKey: "PRO_MONTHLY" }))).status).toBe(200);
    expect(soldProduct()).toBe(mocks.products.PRO_MONTHLY);
    expect((await checkout(json({ planKey: "FOUNDING" }))).status).toBe(200);
    expect(soldProduct()).toBe(mocks.products.FOUNDING_ANNUAL);
  });

  it("keeps the annual fallback in the founding-full message", async () => {
    mocks.reserveFoundingSlot.mockResolvedValue("sold_out");
    const body = await (await checkout(json({ planKey: "FOUNDING" }))).json();
    expect(body.message).toContain(`Pro annual at ${DISPLAY_PRICING.proAnnual}`);
  });
});
