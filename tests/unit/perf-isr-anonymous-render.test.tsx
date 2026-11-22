import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findForbiddenPublicKeys,
  findProtectedMarkerLeaks,
  SEEDED_PROTECTED_MARKERS,
} from "../helpers/protected-leak";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
  readFoundingPublicCount: vi.fn(async () => ({
    offered: true,
    sold_out: false,
  })),
  getHomeSearchChips: vi.fn(async () => []),
  listRelatedDealPreviews: vi.fn(async () => []),
  getAppOrigin: vi.fn(() => "https://example.test"),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/billing/founding-public", () => ({
  readFoundingPublicCount: mocks.readFoundingPublicCount,
}));
vi.mock("@/lib/search/home-chips-server", () => ({
  getHomeSearchChips: mocks.getHomeSearchChips,
}));
vi.mock("@/lib/deals/public-card-previews", () => ({
  listRelatedDealPreviews: mocks.listRelatedDealPreviews,
}));
vi.mock("@/lib/auth/urls", () => ({
  getAppOrigin: mocks.getAppOrigin,
}));

const SLUG = "canary-deal-slug";
const [BUYER, DOMAIN, REFERENCE, SOURCE_TITLE, OCID, NOTICE_URL, CONTACT, DOCUMENT] =
  SEEDED_PROTECTED_MARKERS;

const RAW_ROW = {
  slug: SLUG,
  preview_title: "A public opportunity for managed support services",
  preview_summary:
    "A public organisation needs ongoing technology support from an experienced provider with security clearance and a proven delivery record.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "Technology",
  broad_region: "South East England",
  value_band: "£250k–£500k",
  deadline_band: "Within 3 weeks",
  duration_band: "3–5 years",
  sme_suitability: "HIGH",
  bid_complexity: "MEDIUM",
  competition_level: "LOW",
  requirements_preview: ["relevant implementation experience"],
  relevance_tags: ["managed support"],
  freshness_label: "New this week",
  relevance_score: 97,
  preview_reasons: [
    { code: "KEYWORD_OVERLAP", label: "Keyword overlap with your profile" },
  ],
  buyer_name: BUYER,
  buyerName: BUYER,
  canonical_name: BUYER,
  canonicalName: BUYER,
  domain: DOMAIN,
  website: `https://${DOMAIN}`,
  portal_url: NOTICE_URL,
  portalUrl: NOTICE_URL,
  source_url: NOTICE_URL,
  sourceUrl: NOTICE_URL,
  source_title: SOURCE_TITLE,
  sourceTitle: SOURCE_TITLE,
  application_url: `${NOTICE_URL}/apply`,
  applicationUrl: `${NOTICE_URL}/apply`,
  ocid: OCID,
  reference: REFERENCE,
  notice_identifier: DOCUMENT,
  noticeIdentifier: DOCUMENT,
  contact_email: CONTACT,
  contactEmail: CONTACT,
  email: CONTACT,
  phone: "+441111111111",
  documents: [DOCUMENT],
};

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    blocks.push(JSON.parse(match[1]!));
  }
  return blocks;
}

function expectPublicHtml(html: string): void {
  expect(findProtectedMarkerLeaks(html)).toEqual([]);
  expect(html).not.toContain('"dealId"');
  expect(html).not.toContain("/app/deals/");
  expect(html).not.toContain("revealHref");
  expect(html).not.toContain("matchScore");
  const blocks = jsonLdBlocks(html);
  expect(blocks.length).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(findForbiddenPublicKeys(block)).toEqual([]);
    expect(findProtectedMarkerLeaks(JSON.stringify(block))).toEqual([]);
  }
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.createClient.mockReset();
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "get_preview_dto_by_slug") {
      return { data: [RAW_ROW], error: null };
    }
    if (name === "search_preview_dtos") {
      return { data: [{ ...RAW_ROW, total_count: 1 }], error: null };
    }
    return { data: null, error: null };
  });
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  process.env.NEXT_PUBLIC_APP_URL = "https://dealatlas.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
});

describe("ISR pages render only the sanitised anonymous DTO", () => {
  it("renders the deal page and metadata from a protected RPC row without leaks", async () => {
    const { default: DealPage, generateMetadata } = await import(
      "@/app/(marketing)/deals/[slug]/page"
    );
    const params = Promise.resolve({ slug: SLUG });

    const html = renderToString(await DealPage({ params }));
    expectPublicHtml(html);

    const metadata = await generateMetadata({ params });
    const metadataText = JSON.stringify(metadata);
    expect(metadata).toHaveProperty("title");
    expect(metadata).toHaveProperty("description");
    expect(metadata).toHaveProperty("openGraph");
    expect(metadata).toHaveProperty("twitter");
    expect(metadata).toHaveProperty("alternates");
    expect(findProtectedMarkerLeaks(metadataText)).toEqual([]);
    expect(
      findForbiddenPublicKeys(JSON.parse(metadataText) as unknown),
    ).toEqual([]);
  });

  it("renders the home page from a protected RPC row without leaks", async () => {
    const { default: HomePage } = await import("@/app/(marketing)/page");

    const html = renderToString(await HomePage());
    expectPublicHtml(html);
  });
});
