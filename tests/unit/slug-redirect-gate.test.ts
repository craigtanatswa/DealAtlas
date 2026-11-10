import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "@/lib/supabase/update-session";

const db = vi.hoisted(() => ({
  retired: false,
  previews: [] as Array<Record<string, unknown>>,
  deals: [] as Array<Record<string, unknown>>,
  aliasDealId: null as string | null,
  aliasError: null as { message: string } | null,
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string) => {
      if (fn === "preview_slug_is_retired") {
        return { data: db.retired, error: null };
      }
      if (fn === "resolve_preview_slug_alias") {
        if (db.aliasError) {
          return { data: null, error: db.aliasError };
        }
        return { data: db.aliasDealId, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            if (table === "deal_previews") {
              const row =
                db.previews.find(
                  (preview) => String(preview[column]) === String(value),
                ) ?? null;
              return { data: row, error: null };
            }
            if (table === "deals") {
              const row =
                db.deals.find((deal) => String(deal.id) === String(value)) ?? null;
              return { data: row, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

const RECORDED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET_TOKENS = [
  "Zarqwell Borough Council",
  "ZQN-2026-004417",
  "eprocure.zarqwell-bc.example",
  "ZQ/PROC/8812",
];
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function fakePreview(overrides: Record<string, unknown>) {
  return {
    deal_id: RECORDED_ID,
    is_published: true,
    leakage_risk: "LOW",
    unpublished_by_admin: false,
    main_category: "Energy & Utilities",
    buyer: "Zarqwell Borough Council",
    notice_id: "ZQN-2026-004417",
    portal_host: "eprocure.zarqwell-bc.example",
    reference: "ZQ/PROC/8812",
    ...overrides,
  };
}

function fakeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORDED_ID,
    submission_deadline: "2026-12-01T12:00:00.000Z",
    status: "OPEN",
    buyer: "Zarqwell Borough Council",
    notice_id: "ZQN-2026-004417",
    portal_host: "eprocure.zarqwell-bc.example",
    reference: "ZQ/PROC/8812",
    ...overrides,
  };
}

function dealRequest(path: string) {
  return new NextRequest(
    `https://www.dealatlas.uk${path}?utm_source=linkedin&ref=x`,
  );
}

async function expectNoSourceIdentity(response: Response) {
  const headers = [...response.headers.entries()]
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
  const serialized = `${response.status} ${response.statusText}\n${headers}\n${await response.text()}`;
  const lower = serialized.toLowerCase();
  for (const token of SECRET_TOKENS) {
    expect(lower).not.toContain(token.toLowerCase());
  }
  expect(serialized).not.toMatch(UUID_PATTERN);
}

describe("public deal slug gate redirects", () => {
  beforeEach(() => {
    db.retired = false;
    db.previews = [];
    db.deals = [];
    db.aliasDealId = null;
    db.aliasError = null;
  });

  it("301s a retired slug to the alias target's current published slug", async () => {
    db.retired = true;
    db.aliasDealId = RECORDED_ID;
    db.previews = [
      fakePreview({
        slug: "current-energy-programme-deadbeef",
      }),
    ];
    db.deals = [fakeDeal()];

    const response = await updateSession(
      dealRequest("/deals/old-retired-slug-ab12cd34"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://www.dealatlas.uk/deals/current-energy-programme-deadbeef?utm_source=linkedin",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expectNoSourceIdentity(response);
  });

  it("301s an expired deal to its category landing", async () => {
    db.previews = [
      fakePreview({
        slug: "expired-energy-programme-ab12cd34",
        is_published: false,
        submission_deadline: "2026-05-01T12:00:00.000Z",
        status: "CLOSED",
      }),
    ];
    db.deals = [
      fakeDeal({
        submission_deadline: "2026-05-01T12:00:00.000Z",
        status: "CLOSED",
      }),
    ];

    const response = await updateSession(
      dealRequest("/deals/expired-energy-programme-ab12cd34"),
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://www.dealatlas.uk/categories/energy-utilities?utm_source=linkedin",
    );
    await expectNoSourceIdentity(response);
  });

  it("keeps a leak-held row on 404", async () => {
    db.previews = [
      fakePreview({
        slug: "held-energy-programme-ab12cd34",
        is_published: false,
        leakage_risk: "REVIEW",
        submission_deadline: "2026-05-01T12:00:00.000Z",
        status: "CLOSED",
      }),
    ];
    db.deals = [
      fakeDeal({
        submission_deadline: "2026-05-01T12:00:00.000Z",
        status: "CLOSED",
      }),
    ];

    const response = await updateSession(
      dealRequest("/deals/held-energy-programme-ab12cd34"),
    );

    expect(response.status).toBe(404);
  });

  it("keeps a retired slug at 410 when the alias RPC errors", async () => {
    db.retired = true;
    db.aliasDealId = RECORDED_ID;
    db.aliasError = { message: "function does not exist" };
    db.previews = [
      fakePreview({
        slug: "current-energy-programme-deadbeef",
      }),
    ];
    db.deals = [fakeDeal()];

    const response = await updateSession(
      dealRequest("/deals/old-retired-slug-ab12cd34"),
    );

    expect(response.status).toBe(410);
  });
  it("lets a published current slug through to the page", async () => {
    db.previews = [fakePreview({ slug: "current-energy-programme-deadbeef" })];
    db.deals = [fakeDeal()];

    const response = await updateSession(
      dealRequest("/deals/current-energy-programme-deadbeef"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps an unpublished row with a future deadline on 404", async () => {
    db.previews = [
      fakePreview({ slug: "pending-energy-programme-ab12cd34", is_published: false }),
    ];
    db.deals = [fakeDeal({ submission_deadline: "2031-11-17T12:00:00.000Z", status: "OPEN" })];

    const response = await updateSession(
      dealRequest("/deals/pending-energy-programme-ab12cd34"),
    );

    expect(response.status).toBe(404);
  });

  it("keeps an admin-held expired row on 404", async () => {
    db.previews = [
      fakePreview({
        slug: "admin-held-energy-programme-ab12cd34",
        is_published: false,
        unpublished_by_admin: true,
      }),
    ];
    db.deals = [fakeDeal({ submission_deadline: "2026-05-01T12:00:00.000Z", status: "CLOSED" })];

    const response = await updateSession(
      dealRequest("/deals/admin-held-energy-programme-ab12cd34"),
    );

    expect(response.status).toBe(404);
  });

  it("keeps a retired slug with no alias at 410", async () => {
    db.retired = true;

    const response = await updateSession(
      dealRequest("/deals/old-retired-slug-ab12cd34"),
    );

    expect(response.status).toBe(410);
  });
});
