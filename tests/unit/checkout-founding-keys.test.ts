import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppProfile } from "@/lib/auth/types";
import {
  CHECKOUT_PLAN_KEYS,
  selectCheckoutProduct,
} from "@/lib/billing/plans";
import { FOUNDING_UNAVAILABLE_MESSAGE } from "@/lib/billing/founding";
import { FOUNDING_PLAN_KEY } from "@/lib/billing/founding-ui";
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

function formRequest(body: Record<string, string>): NextRequest {
  return new NextRequest("https://www.dealatlas.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

function sessionProduct(session: Record<string, unknown>): string {
  const cart = session.product_cart as Array<{ product_id: string }>;
  return cart[0]?.product_id ?? "";
}

function sessionMetadata(session: Record<string, unknown>): Record<string, string> {
  return session.metadata as Record<string, string>;
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

describe("checkout founding plan keys", () => {
  it("never reserves for standard annual checkout", async () => {
    const response = await checkout({ planKey: "PRO_ANNUAL" });

    expect(response.status).toBe(200);
    expect(mocks.reserveFoundingSlot).not.toHaveBeenCalled();
    expect(mocks.readFoundingMember).toHaveBeenCalledTimes(1);
    expect(mocks.sessions).toHaveLength(1);
    expect(sessionProduct(mocks.sessions[0])).toBe(mocks.products.PRO_ANNUAL);
  });

  it("reserves exactly once for an open founding checkout", async () => {
    const response = await checkout({ planKey: "FOUNDING" });

    expect(response.status).toBe(200);
    expect(mocks.reserveFoundingSlot).toHaveBeenCalledTimes(1);
    expect(mocks.sessions).toHaveLength(1);
    expect(sessionProduct(mocks.sessions[0])).toBe(
      mocks.products.FOUNDING_ANNUAL,
    );
  });

  it("does not create a session when the founding slot is sold out", async () => {
    for (const reservation of ["sold_out", "unavailable"] as const) {
      vi.clearAllMocks();
      mocks.sessions.length = 0;
      mocks.readFoundingMember.mockResolvedValue(false);
      mocks.reserveFoundingSlot.mockResolvedValue(reservation);

      const response = await checkout({ planKey: "FOUNDING" });

      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe(FOUNDING_UNAVAILABLE_MESSAGE);
      expect(mocks.checkoutHandler).not.toHaveBeenCalled();
      expect(mocks.sessions).toHaveLength(0);
    }
  });

  it("redirects a sold-out form post to the founding-full page", async () => {
    mocks.reserveFoundingSlot.mockResolvedValue("sold_out");

    const response = await createAuthenticatedCheckoutResponse({
      request: formRequest({
        planKey: "FOUNDING",
        returnTo: "/pricing",
      }),
      user: USER,
      profile: PROFILE,
    });

    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/checkout/founding-full");
    expect(location).toContain("next=%2Fpricing");
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
    expect(mocks.sessions).toHaveLength(0);
  });

  it("fails closed when the founding product is not configured", async () => {
    const { FOUNDING_ANNUAL: _founding, ...withoutFounding } = mocks.products;
    void _founding;
    mocks.products = withoutFounding;

    const response = await checkout({ planKey: "FOUNDING" });

    expect(response.status).toBe(409);
    expect(mocks.reserveFoundingSlot).not.toHaveBeenCalled();
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
    expect(mocks.sessions).toHaveLength(0);
  });

  it("keeps founding and standard annual checkout independent under a race", async () => {
    let taken = 0;
    mocks.reserveFoundingSlot.mockImplementation(async () => {
      if (taken < 25) {
        taken += 1;
        return "reserved";
      }
      return "sold_out";
    });

    const founding = Array.from({ length: 40 }, (_, index) =>
      checkout({ planKey: "FOUNDING" }, userFor(index)),
    );
    const annual = Array.from({ length: 20 }, (_, index) =>
      checkout({ planKey: "PRO_ANNUAL" }, userFor(100 + index)),
    );
    const responses = await Promise.all([...founding, ...annual]);

    const foundingResponses = responses.slice(0, 40);
    const annualResponses = responses.slice(40);

    expect(foundingResponses.filter((response) => response.status === 200)).toHaveLength(25);
    expect(foundingResponses.filter((response) => response.status === 409)).toHaveLength(15);
    expect(annualResponses.every((response) => response.status === 200)).toBe(true);
    expect(mocks.reserveFoundingSlot).toHaveBeenCalledTimes(40);
    expect(taken).toBe(25);

    const foundingSessions = mocks.sessions.filter(
      (session) => sessionProduct(session) === mocks.products.FOUNDING_ANNUAL,
    );
    const annualSessions = mocks.sessions.filter(
      (session) => sessionProduct(session) === mocks.products.PRO_ANNUAL,
    );
    expect(foundingSessions).toHaveLength(25);
    expect(annualSessions).toHaveLength(20);
  });

  it("rejects tampered and unknown plan keys without reserving or creating a session", async () => {
    const bodies: unknown[] = [
      { planKey: "PRO_ANNUAL_LEGACY" },
      { planKey: "FOUNDING_ANNUAL" },
      { planKey: "founding" },
      { planKey: "" },
      { planKey: 123 },
      { planKey: null },
      { planKey: "FOUNDING", productId: "pdt_test_annual" },
      { planKey: "FOUNDING", product_id: "pdt_test_annual" },
      { planKey: "FOUNDING", metadata: { plan_key: "FOUNDING" } },
    ];

    for (const body of bodies) {
      const response = await checkout(body);
      expect(response.status).toBe(400);
    }

    expect(mocks.reserveFoundingSlot).not.toHaveBeenCalled();
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
    expect(mocks.sessions).toHaveLength(0);
  });

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

  it("stores PRO_ANNUAL metadata for a founding checkout", async () => {
    const response = await checkout({ planKey: "FOUNDING" });

    expect(response.status).toBe(200);
    expect(sessionMetadata(mocks.sessions[0]).plan_key).toBe("PRO_ANNUAL");
  });
});

describe("selectCheckoutProduct matrix", () => {
  const withFounding: PlanProductMap = {
    PRO_MONTHLY: "pdt_test_monthly",
    PRO_ANNUAL: "pdt_test_annual",
    PRO_ANNUAL_LEGACY: ["pdt_test_annual_legacy"],
    FOUNDING_ANNUAL: "pdt_test_founding",
  };
  const withoutFounding: PlanProductMap = {
    PRO_MONTHLY: "pdt_test_monthly",
    PRO_ANNUAL: "pdt_test_annual",
    PRO_ANNUAL_LEGACY: ["pdt_test_annual_legacy"],
  };
  const reservations: Array<FoundingReservation | null> = [
    "reserved",
    "active",
    "sold_out",
    "closed",
    "unavailable",
    null,
  ];

  it("never upgrades standard annual to founding unless the user is a founder", () => {
    for (const products of [withFounding, withoutFounding]) {
      for (const founder of [false, true]) {
        for (const reservation of reservations) {
          const selection = selectCheckoutProduct({
            planKey: "PRO_ANNUAL",
            products,
            founder,
            reservation,
          });
          expect(selection).toEqual({
            ok: true,
            productId:
              founder && products.FOUNDING_ANNUAL
                ? products.FOUNDING_ANNUAL
                : products.PRO_ANNUAL,
            founding: Boolean(founder && products.FOUNDING_ANNUAL),
          });
        }
      }
    }
  });

  it("never falls back from founding to standard annual or a legacy id", () => {
    for (const products of [withFounding, withoutFounding]) {
      for (const founder of [false, true]) {
        for (const reservation of reservations) {
          const selection = selectCheckoutProduct({
            planKey: "FOUNDING",
            products,
            founder,
            reservation,
          });
          if (!selection.ok) {
            expect(selection).toEqual({
              ok: false,
              reason: "founding_unavailable",
            });
            continue;
          }
          expect(selection.productId).toBe(products.FOUNDING_ANNUAL);
          expect(selection.productId).not.toBe(products.PRO_ANNUAL);
          expect(products.PRO_ANNUAL_LEGACY).not.toContain(
            selection.productId,
          );
          const eligible =
            Boolean(products.FOUNDING_ANNUAL) &&
            (founder ||
              reservation === "reserved" ||
              reservation === "active" ||
              reservation === "closed");
          expect(eligible).toBe(true);
        }
      }
    }
  });

  it("keeps monthly standard for leaders and founders alike", () => {
    for (const products of [withFounding, withoutFounding]) {
      for (const founder of [false, true]) {
        for (const reservation of reservations) {
          expect(
            selectCheckoutProduct({
              planKey: "PRO_MONTHLY",
              products,
              founder,
              reservation,
            }),
          ).toEqual({
            ok: true,
            productId: products.PRO_MONTHLY,
            founding: false,
          });
        }
      }
    }
  });

  it("covers every checkout plan key", () => {
    expect(CHECKOUT_PLAN_KEYS).toEqual([
      "PRO_MONTHLY",
      "PRO_ANNUAL",
      "FOUNDING",
    ]);
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

describe("checkout error contract for the UI", () => {
  it("returns 409 FOUNDING_CAP_FULL with the exact message when founding is full", async () => {
    mocks.readFoundingMember.mockResolvedValue(false);
    mocks.reserveFoundingSlot.mockResolvedValue("sold_out");

    const response = await checkout({ planKey: FOUNDING_PLAN_KEY });

    expect(FOUNDING_PLAN_KEY).toBe("FOUNDING");
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("FOUNDING_CAP_FULL");
    expect(body.message).toBe(
      "Founding places are all taken. You can still subscribe to Pro annual at £350/year.",
    );
    expect(body.checkout_url).toBeUndefined();
  });

  it("returns 400 INVALID_PLAN for tampered or unknown plan keys", async () => {
    for (const body of [
      { planKey: "FOUNDING_ANNUAL" },
      { planKey: "PRO_ANNUAL_LEGACY" },
      { planKey: "founding" },
      { planKey: 7 },
      {},
      { planKey: "FOUNDING", product_id: "pdt_test_annual" },
      { planKey: "PRO_ANNUAL", metadata: { plan_key: "FOUNDING" } },
    ]) {
      const response = await checkout(body);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("INVALID_PLAN");
      expect(typeof json.message).toBe("string");
    }
    expect(mocks.reserveFoundingSlot).not.toHaveBeenCalled();
    expect(mocks.checkoutHandler).not.toHaveBeenCalled();
  });
});
