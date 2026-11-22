import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFoundingPublicCount: vi.fn(async () => ({
    offered: true,
    sold_out: false,
  })),
  getHomeSearchChips: vi.fn(async () => []),
  getCachedHomeLivePreviews: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 6,
  })),
  getCachedPublicDealPreview: vi.fn(async () => null),
  listRelatedDealPreviews: vi.fn(async () => []),
  getAppOrigin: vi.fn(() => "https://example.test"),
  createSupabaseAnonymousClient: vi.fn(() => ({})),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingPublicCount: mocks.readFoundingPublicCount,
}));
vi.mock("@/lib/search/home-chips-server", () => ({
  getHomeSearchChips: mocks.getHomeSearchChips,
}));
vi.mock("@/lib/search/public-cached", () => ({
  getCachedHomeLivePreviews: mocks.getCachedHomeLivePreviews,
  getCachedPublicDealPreview: mocks.getCachedPublicDealPreview,
}));
vi.mock("@/lib/deals/public-card-previews", () => ({
  listRelatedDealPreviews: mocks.listRelatedDealPreviews,
}));
vi.mock("@/lib/auth/urls", () => ({
  getAppOrigin: mocks.getAppOrigin,
}));
vi.mock("@/lib/supabase/anonymous", () => ({
  createSupabaseAnonymousClient: mocks.createSupabaseAnonymousClient,
}));

import * as DealPage from "@/app/(marketing)/deals/[slug]/page";
import * as HomePage from "@/app/(marketing)/page";

const ROOT = process.cwd();
const SOURCES = [
  "app/(marketing)/page.tsx",
  "app/(marketing)/deals/[slug]/page.tsx",
  "app/(marketing)/layout.tsx",
];

const FORBIDDEN_SOURCES = [
  "getAuthUser",
  "getCurrentAccount",
  "getCurrentEntitlement",
  "createSupabaseServerClient",
  "next/headers",
];

describe("ISR page configuration", () => {
  it("fails closed to static error rendering and revalidates every 300s", () => {
    expect(HomePage.dynamic).toBe("error");
    expect(HomePage.revalidate).toBe(300);
    expect(DealPage.dynamic).toBe("error");
    expect(DealPage.revalidate).toBe(300);
  });

  it("builds no deal params and allows later slugs to be generated", async () => {
    expect(DealPage.dynamicParams).toBe(true);
    await expect(DealPage.generateStaticParams()).resolves.toEqual([]);
  });

  it("keeps request-scoped auth, headers and search params out of public pages", () => {
    for (const relative of SOURCES) {
      const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
      for (const forbidden of FORBIDDEN_SOURCES) {
        expect(source, `${relative} must not use ${forbidden}`).not.toContain(
          forbidden,
        );
      }
      expect(source, `${relative} must not read searchParams`).not.toMatch(
        /\bsearchParams\b/,
      );
    }
  });
});
