import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const result = state.tables[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.limit = () => Promise.resolve(result);
      builder.maybeSingle = () => Promise.resolve(result);
      return builder;
    },
  }),
}));

import { hasLiveSubscription } from "@/lib/billing/live-subscription";
import { loadCurrentLifetimeGrant } from "@/lib/entitlements/store";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("lifetime grant lookup before migration 0062", () => {
  beforeEach(() => {
    state.tables = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null and warns without ids when the lifetime table query fails", async () => {
    state.tables.lifetime_grants = {
      data: null,
      error: { message: 'relation "lifetime_grants" does not exist' },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadCurrentLifetimeGrant(USER_ID)).resolves.toBeNull();

    const lines = warn.mock.calls.map((call) => call.map(String).join(" "));
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line).toContain("Lifetime grant lookup failed");
    expect(line).not.toContain(USER_ID);
    expect(line).not.toMatch(/pdt_|user|relation/i);
  });

  it("returns the active grant when the lifetime table exists", async () => {
    state.tables.lifetime_grants = {
      data: {
        status: "active",
        dodo_product_id: "pdt_lifetime",
        granted_at: "2026-06-01T00:00:00.000Z",
      },
      error: null,
    };

    await expect(loadCurrentLifetimeGrant(USER_ID)).resolves.toEqual({
      status: "active",
      dodoProductId: "pdt_lifetime",
      grantedAt: "2026-06-01T00:00:00.000Z",
    });
  });
});

describe("live subscription check before migration 0062", () => {
  beforeEach(() => {
    state.tables = {
      subscriptions: { data: [], error: null },
      profiles: { data: { founding_member: false }, error: null },
      lifetime_grants: { data: [], error: null },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a lifetime_grants query error as no grant instead of throwing", async () => {
    state.tables.lifetime_grants = {
      data: null,
      error: { message: 'relation "lifetime_grants" does not exist' },
    };

    await expect(hasLiveSubscription(USER_ID)).resolves.toBe(false);
  });

  it("still blocks a lifetime holder through profiles.founding_member", async () => {
    state.tables.profiles = { data: { founding_member: true }, error: null };
    state.tables.lifetime_grants = {
      data: null,
      error: { message: 'relation "lifetime_grants" does not exist' },
    };

    await expect(hasLiveSubscription(USER_ID)).resolves.toBe(true);
  });

  it("still throws when the subscriptions query fails", async () => {
    state.tables.subscriptions = {
      data: null,
      error: { message: "database unavailable" },
    };

    await expect(hasLiveSubscription(USER_ID)).rejects.toThrow(
      "Failed to check existing subscriptions.",
    );
  });

  it("still throws when the profiles query fails", async () => {
    state.tables.profiles = {
      data: null,
      error: { message: "database unavailable" },
    };

    await expect(hasLiveSubscription(USER_ID)).rejects.toThrow(
      "Failed to check existing subscriptions.",
    );
  });
});
