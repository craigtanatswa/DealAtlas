import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  env: { DODO_FOUNDING_PRODUCT_ID: "pdt_test_founding" } as Record<string, string | undefined>,
  remaining: 24 as unknown,
  role: "anon" as "anon" | "free" | "pro",
}));

vi.mock("@/lib/env/server", () => ({ getServerEnv: () => state.env }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: state.remaining, error: null }),
  }),
}));
// The route must not vary by viewer; a session is mocked to prove that.
vi.mock("@/lib/auth/session", () => ({
  getAuthUser: async () => (state.role === "anon" ? null : { id: `user-${state.role}` }),
  getCurrentAccount: async () =>
    state.role === "anon"
      ? null
      : { user: { id: `user-${state.role}` }, profile: { plan: state.role === "pro" ? "PRO" : "FREE" } },
}));

import { GET } from "@/app/api/founding/route";
import { foundingAvailabilityPayload } from "@/lib/billing/founding";
import { readFoundingPublicCount } from "@/lib/billing/founding-public";

async function body(): Promise<{ text: string; json: Record<string, unknown> }> {
  const res = await GET();
  const text = await res.text();
  return { text, json: JSON.parse(text) };
}

beforeEach(() => {
  state.env = { DODO_FOUNDING_PRODUCT_ID: "pdt_test_founding" };
  state.remaining = 24;
  state.role = "anon";
});

describe("public /api/founding", () => {
  for (const role of ["anon", "free", "pro"] as const) {
    it(`returns exactly { sold_out } for ${role}`, async () => {
      state.role = role;
      const { text, json } = await body();
      expect(Object.keys(json)).toEqual(["sold_out"]);
      expect(json.sold_out).toBe(false);
      expect(text).not.toMatch(/remaining|cap|used|\d/);
    });
  }

  it("reports sold out at zero without a count", async () => {
    state.remaining = 0;
    expect((await body()).json).toEqual({ sold_out: true });
  });

  it("payload helper never carries the count", () => {
    expect(foundingAvailabilityPayload(12)).toEqual({ sold_out: false });
    expect(foundingAvailabilityPayload(0)).toEqual({ sold_out: true });
    expect(foundingAvailabilityPayload(Number.NaN)).toEqual({ sold_out: true });
  });
});

describe("missing DODO_FOUNDING_PRODUCT_ID fails closed", () => {
  it("API says sold out and the page state hides founding", async () => {
    state.env = {};
    expect((await body()).json).toEqual({ sold_out: true });
    expect(await readFoundingPublicCount()).toEqual({ offered: false, sold_out: true });
  });

  it("an env read that throws is treated as not configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env/server", () => ({
      getServerEnv: () => {
        throw new Error("env invalid");
      },
    }));
    const { readFoundingPublicCount: read } = await import("@/lib/billing/founding-public");
    const { GET: get } = await import("@/app/api/founding/route");
    expect(await read()).toEqual({ offered: false, sold_out: true });
    expect(await (await get()).json()).toEqual({ sold_out: true });
    vi.doUnmock("@/lib/env/server");
  });

  it("public count shape has no numbers when configured", async () => {
    const count = await readFoundingPublicCount();
    expect(Object.keys(count).sort()).toEqual(["offered", "sold_out"]);
  });
});
