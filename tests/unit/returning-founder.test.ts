import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppProfile } from "@/lib/auth/types";
import {
  selectCheckoutProduct,
  shouldReserveFoundingSlot,
} from "@/lib/billing/plans";
import {
  returningFounderSelection,
  skipsFoundingReservation,
} from "@/lib/billing/returning-founder";
import { FOUNDING_UNAVAILABLE_MESSAGE } from "@/lib/billing/founding";
import type {
  FoundingReservation,
  PlanProductMap,
} from "@/lib/billing/types";

const mocks = vi.hoisted(() => ({
  readFoundingMember: vi.fn(),
  reserveFoundingSlot: vi.fn(),
  checkoutHandler: vi.fn(),
  products: {
    PRO_MONTHLY: "pdt_test_monthly",
    PRO_ANNUAL: "pdt_test_annual",
    PRO_ANNUAL_LEGACY: ["pdt_test_annual_legacy"],
    FOUNDING_ANNUAL: "pdt_test_founding",
  } as PlanProductMap,
  sessions: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/billing/founding-db", () => ({
  readFoundingMember: mocks.readFoundingMember,
  reserveFoundingSlot: mocks.reserveFoundingSlot,
}));

vi.mock("@/lib/billing/config", () => ({
  requireDodoCheckoutConfig: () => ({
    bearerToken: "dodo_test_api_key",
    environment: "test_mode",
    returnUrl: "https://www.dealatlas.example/checkout/success",
    products: mocks.products,
  }),
}));

vi.mock("@dodopayments/nextjs", () => ({
  Checkout: () => mocks.checkoutHandler,
}));

import { createAuthenticatedCheckoutResponse } from "@/lib/billing/checkout";

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

function userFor(index: number) {
  return {
    id: `user_test_${index}`,
    email: `buyer${index}@example.com`,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  };
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("https://www.dealatlas.example/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

function sessionProduct(session: Record<string, unknown>): string {
  const cart = session.product_cart as Array<{ product_id: string }>;
  return cart[0]?.product_id ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions.length = 0;
  mocks.products = {
    PRO_MONTHLY: "pdt_test_monthly",
    PRO_ANNUAL: "pdt_test_annual",
    PRO_ANNUAL_LEGACY: ["pdt_test_annual_legacy"],
    FOUNDING_ANNUAL: "pdt_test_founding",
  };
  mocks.readFoundingMember.mockResolvedValue(false);
  mocks.reserveFoundingSlot.mockResolvedValue("reserved");
  mocks.checkoutHandler.mockImplementation(async (request: Request) => {
    mocks.sessions.push(
      (await request.json()) as Record<string, unknown>,
    );
    return new Response(
      JSON.stringify({ checkout_url: "https://checkout.example/x" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  });
});

async function checkout(
  body: unknown,
  user: { id: string; email: string; email_confirmed_at: string } = USER,
) {
  return createAuthenticatedCheckoutResponse({
    request: jsonRequest(body),
    user,
    profile: PROFILE,
  });
}

// Returning-founder rule only. Delete this file together with
// lib/billing/returning-founder.ts if the rule is reversed.

describe("returning-founder rule (pure)", () => {
  const products: PlanProductMap = {
    PRO_MONTHLY: "pdt_test_monthly",
    PRO_ANNUAL: "pdt_test_annual",
    PRO_ANNUAL_LEGACY: ["pdt_test_annual_legacy"],
    FOUNDING_ANNUAL: "pdt_test_founding",
  };
  const reservations: Array<FoundingReservation | null> = [
    "reserved",
    "active",
    "sold_out",
    "closed",
    "unavailable",
    null,
  ];

  it("gives a founder the founding product on FOUNDING and PRO_ANNUAL for any reservation", () => {
    for (const planKey of ["FOUNDING", "PRO_ANNUAL"] as const) {
      for (const reservation of reservations) {
        expect(returningFounderSelection({ planKey, products, founder: true, reservation })).toEqual({
          ok: true,
          productId: products.FOUNDING_ANNUAL,
          founding: true,
        });
        expect(selectCheckoutProduct({ planKey, products, founder: true, reservation })).toEqual({
          ok: true,
          productId: products.FOUNDING_ANNUAL,
          founding: true,
        });
      }
    }
  });

  it("treats a DB founder answer (active / closed) as founding on FOUNDING only", () => {
    for (const reservation of ["active", "closed"] as const) {
      expect(
        selectCheckoutProduct({ planKey: "FOUNDING", products, founder: false, reservation }),
      ).toEqual({ ok: true, productId: products.FOUNDING_ANNUAL, founding: true });
      expect(
        selectCheckoutProduct({ planKey: "PRO_ANNUAL", products, founder: false, reservation }),
      ).toEqual({ ok: true, productId: products.PRO_ANNUAL, founding: false });
    }
  });

  it("never applies to monthly or when founding is not configured", () => {
    const { FOUNDING_ANNUAL: _f, ...withoutFounding } = products;
    void _f;
    for (const reservation of reservations) {
      expect(
        returningFounderSelection({ planKey: "PRO_MONTHLY", products, founder: true, reservation }),
      ).toBeNull();
      expect(
        returningFounderSelection({
          planKey: "FOUNDING",
          products: withoutFounding,
          founder: true,
          reservation,
        }),
      ).toBeNull();
    }
  });

  it("skips the reservation call for founders", () => {
    expect(skipsFoundingReservation(true)).toBe(true);
    expect(skipsFoundingReservation(false)).toBe(false);
    expect(shouldReserveFoundingSlot("FOUNDING", products, true)).toBe(false);
  });
});

describe("returning founders at checkout", () => {
  it("keeps the founding price for returning founders without reserving", async () => {
    mocks.readFoundingMember.mockResolvedValue(true);

    const founding = await checkout({ planKey: "FOUNDING" });
    expect(founding.status).toBe(200);
    expect(sessionProduct(mocks.sessions[0])).toBe(
      mocks.products.FOUNDING_ANNUAL,
    );

    const annual = await checkout({ planKey: "PRO_ANNUAL" });
    expect(annual.status).toBe(200);
    expect(sessionProduct(mocks.sessions[1])).toBe(
      mocks.products.FOUNDING_ANNUAL,
    );

    expect(mocks.reserveFoundingSlot).not.toHaveBeenCalled();
  });

  it("treats an existing active founding slot as available", async () => {
    mocks.readFoundingMember.mockResolvedValue(false);
    mocks.reserveFoundingSlot.mockResolvedValue("closed");

    const response = await checkout({ planKey: "FOUNDING" });

    expect(response.status).toBe(200);
    expect(sessionProduct(mocks.sessions[0])).toBe(
      mocks.products.FOUNDING_ANNUAL,
    );
  });

});

describe("returning founders while the founding cap is full", () => {
  const EX_FOUNDER = userFor(999);
  const NEW_USER = userFor(998);

  function capFull() {
    // Server-side state: 25 places held by others. The reserve RPC is the
    // DB cap check and would answer sold_out for anyone new.
    const state = { taken: 25 };
    mocks.reserveFoundingSlot.mockImplementation(async () => "sold_out");
    return state;
  }

  it("gives a returning ex-founder the founding product without taking a place", async () => {
    const state = capFull();
    mocks.readFoundingMember.mockImplementation(async (id: string) => id === EX_FOUNDER.id);

    const response = await checkout({ planKey: "FOUNDING" }, EX_FOUNDER);

    expect(response.status).toBe(200);
    expect(sessionProduct(mocks.sessions[0])).toBe(mocks.products.FOUNDING_ANNUAL);
    expect(mocks.reserveFoundingSlot).not.toHaveBeenCalled();
    expect(state.taken).toBe(25);
  });

  it("still fails closed for a brand-new user", async () => {
    capFull();
    mocks.readFoundingMember.mockImplementation(async (id: string) => id === EX_FOUNDER.id);

    const response = await checkout({ planKey: "FOUNDING" }, NEW_USER);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(FOUNDING_UNAVAILABLE_MESSAGE);
    expect(mocks.reserveFoundingSlot).toHaveBeenCalledTimes(1);
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
  });

  it("uses the DB answer when the profile read misses an ex-founder", async () => {
    // reserve_founding_slot checks profiles.founding_member before the cap and
    // returns "active" for a founder, so a failed profile read still sells founding.
    mocks.readFoundingMember.mockResolvedValue(false);
    mocks.reserveFoundingSlot.mockImplementation(async (id: string) =>
      id === EX_FOUNDER.id ? "active" : "sold_out",
    );

    const response = await checkout({ planKey: "FOUNDING" }, EX_FOUNDER);

    expect(response.status).toBe(200);
    expect(sessionProduct(mocks.sessions[0])).toBe(mocks.products.FOUNDING_ANNUAL);
  });

  it("ignores any client hint about founder status", async () => {
    capFull();
    mocks.readFoundingMember.mockResolvedValue(false);

    const response = await checkout({ planKey: "FOUNDING", founder: true } as unknown, NEW_USER);

    expect([400, 409]).toContain(response.status);
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
  });
});

