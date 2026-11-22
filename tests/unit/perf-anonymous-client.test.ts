import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findForbiddenPublicKeys,
  SEEDED_PROTECTED_MARKERS,
} from "../helpers/protected-leak";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  cookies: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { createSupabaseAnonymousClient } from "@/lib/supabase/anonymous";
import { getCachedPublicDealPreview } from "@/lib/search/public-cached";

const SUPABASE_URL = "https://local.supabase.test";
const PUBLISHABLE_KEY = "sb_publishable_test";
const SLUG = "canary-deal-slug";

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
  relevance_score: 91,
  preview_reasons: [
    { code: "KEYWORD_OVERLAP", label: "Keyword overlap with your profile" },
  ],
  source_url: "https://canary-source.example/notice",
  sourceUrl: "https://canary-source.example/notice",
  source_title: SEEDED_PROTECTED_MARKERS[3],
  sourceTitle: SEEDED_PROTECTED_MARKERS[3],
  application_url: "https://canary-source.example/apply",
  applicationUrl: "https://canary-source.example/apply",
  ocid: SEEDED_PROTECTED_MARKERS[4],
  reference: SEEDED_PROTECTED_MARKERS[2],
  buyer_organization_id: "buyer-uuid-never-public",
  buyerOrganizationId: "buyer-uuid-never-public",
  canonical_name: SEEDED_PROTECTED_MARKERS[0],
  canonicalName: SEEDED_PROTECTED_MARKERS[0],
  notice_identifier: SEEDED_PROTECTED_MARKERS[7],
  noticeIdentifier: SEEDED_PROTECTED_MARKERS[7],
  contact_email: SEEDED_PROTECTED_MARKERS[6],
  contactEmail: SEEDED_PROTECTED_MARKERS[6],
  email: SEEDED_PROTECTED_MARKERS[6],
  phone: "+441111111111",
  domain: SEEDED_PROTECTED_MARKERS[1],
  website: `https://${SEEDED_PROTECTED_MARKERS[1]}`,
};

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.cookies.mockReset();
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: [RAW_ROW], error: null });
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  process.env.NEXT_PUBLIC_APP_URL = "https://dealatlas.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("anonymous Supabase client", () => {
  it("uses the publishable key, never persists a session and never reads cookies", () => {
    mocks.cookies.mockReturnValue({
      get: () => ({
        name: "sb-project-auth-token",
        value: "pro-session-cookie",
      }),
      getAll: () => [
        { name: "sb-project-auth-token", value: "pro-session-cookie" },
      ],
    });

    createSupabaseAnonymousClient();

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = mocks.createClient.mock.calls[0]!;
    expect(url).toBe(SUPABASE_URL);
    expect(key).toBe(PUBLISHABLE_KEY);
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.autoRefreshToken).toBe(false);
    expect(options.global?.headers?.Authorization).toBeUndefined();
    expect(options.global?.headers?.authorization).toBeUndefined();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("sanitises the cached public preview even when the RPC row carries protected fields", async () => {
    const preview = await getCachedPublicDealPreview(SLUG);

    expect(mocks.rpc).toHaveBeenCalledWith("get_preview_dto_by_slug", {
      p_slug: SLUG,
    });
    expect(preview).not.toBeNull();
    expect(findForbiddenPublicKeys(preview)).toEqual([]);
    expect(preview).not.toHaveProperty("relevanceScore");
    expect(preview).not.toHaveProperty("previewReasons");
    expect(preview).not.toHaveProperty("matchScore");
    expect(preview).not.toHaveProperty("relevance_score");
    expect(preview).not.toHaveProperty("preview_reasons");
    const serialized = JSON.stringify(preview);
    for (const marker of SEEDED_PROTECTED_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });
});
