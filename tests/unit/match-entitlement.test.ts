import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const previews = vi.hoisted(() => ({
  searchPublishedDealPreviews: vi.fn(),
  listPublishedDealPreviews: vi.fn(),
  getPublishedDealPreviewBySlug: vi.fn(),
  getPublishedDealPreviewByDealId: vi.fn(),
  resolvePublishedPreviewDealId: vi.fn(),
}));
const entitlement = vi.hoisted(() => ({ pro: false as boolean | "throw" }));
const profile = vi.hoisted(() => ({ id: "cp-1" as string | null }));

vi.mock("@/lib/db/previews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/previews")>()),
  ...previews,
}));
vi.mock("@/lib/entitlements/service", () => ({
  getCurrentEntitlement: vi.fn(async () => {
    if (entitlement.pro === "throw") throw new Error("entitlement store down");
    return { pro: entitlement.pro };
  }),
}));
vi.mock("@/lib/entitlements/policy", () => ({
  isProEntitlement: (e: { pro: boolean }) => e.pro === true,
}));
vi.mock("@/lib/matching/load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/matching/load")>()),
  loadCompanyProfileIdForUser: vi.fn(async () => profile.id),
}));

import {
  gatedRowMatch,
  NO_MATCH_ACCESS,
  resolveMatchAccess,
  resolveMatchAccessWith,
} from "@/lib/matching/entitlement";
import { toSafeMatchView } from "@/lib/matching/load";
import { searchDealPreviewsForUser, searchHomeLatestDealPreviews } from "@/lib/matching/search";
import { toDealCardData, toPublicDealPreview } from "@/lib/search/dto";
import {
  getPublicDealPreviewPageByDealId,
  getPublicDealPreviewPageBySlug,
} from "@/lib/search/public";

const MATCH_KEYS = ["score", "reasons", "matchScore", "matchReasons", "relevance_score", "preview_reasons"];
const client = {} as never;
const REASONS = [{ code: "KEYWORD_OVERLAP", kind: "match", label: "Keyword overlap with the opportunity preview" }];

function row(slug: string, score: number | null) {
  return {
    slug,
    preview_title: "Grounds maintenance",
    preview_summary: "A public body needs grounds maintenance.",
    deal_type: "PUBLIC_TENDER",
    buyer_sector: "PUBLIC",
    stage: "LIVE",
    status: "OPEN",
    main_category: "facilities",
    broad_region: "Nationwide",
    value_band: null,
    deadline_band: null,
    duration_band: null,
    sme_suitability: null,
    bid_complexity: null,
    competition_level: null,
    requirements_preview: [],
    relevance_tags: [],
    freshness_label: null,
    relevance_score: score,
    preview_reasons: score == null ? null : REASONS,
    total_count: 2,
  };
}

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  entitlement.pro = false;
  profile.id = "cp-1";
  previews.searchPublishedDealPreviews.mockResolvedValue([row("a-1", 90), row("b-2", 10)]);
  previews.listPublishedDealPreviews.mockResolvedValue([row("a-1", 90), row("b-2", 10)]);
  previews.getPublishedDealPreviewBySlug.mockResolvedValue(row("a-1", 90));
  previews.getPublishedDealPreviewByDealId.mockResolvedValue(row("a-1", 90));
  previews.resolvePublishedPreviewDealId.mockResolvedValue("deal-1");
});

describe("resolveMatchAccessWith (the single match gate)", () => {
  const deps = (pro: boolean | Error, id: string | null) => ({
    isPro: async () => {
      if (pro instanceof Error) throw pro;
      return pro;
    },
    loadCompanyProfileId: async () => id,
  });

  it("denies anonymous viewers", async () => {
    expect(await resolveMatchAccessWith(null, deps(true, "cp"))).toEqual(NO_MATCH_ACCESS);
    expect(await resolveMatchAccessWith(undefined, deps(true, "cp"))).toEqual(NO_MATCH_ACCESS);
  });
  it("denies free viewers but keeps the profile id for UI prompts", async () => {
    expect(await resolveMatchAccessWith("u", deps(false, "cp"))).toEqual({ enabled: false, companyProfileId: "cp" });
  });
  it("denies Pro viewers without a company profile", async () => {
    expect((await resolveMatchAccessWith("u", deps(true, null))).enabled).toBe(false);
  });
  it("allows Pro viewers with a profile", async () => {
    expect(await resolveMatchAccessWith("u", deps(true, "cp"))).toEqual({ enabled: true, companyProfileId: "cp" });
  });
  it("fails closed when the entitlement cannot be read", async () => {
    expect((await resolveMatchAccessWith("u", deps(new Error("down"), "cp"))).enabled).toBe(false);
  });
  it("treats a non-true isPro result as not Pro", async () => {
    const access = await resolveMatchAccessWith("u", {
      isPro: async () => "yes" as unknown as boolean,
      loadCompanyProfileId: async () => "cp",
    });
    expect(access.enabled).toBe(false);
  });
  it("resolveMatchAccess fails closed through the real wiring", async () => {
    entitlement.pro = "throw";
    expect((await resolveMatchAccess(client, "u")).enabled).toBe(false);
    entitlement.pro = true;
    expect((await resolveMatchAccess(client, "u")).enabled).toBe(true);
  });
});

describe("gatedRowMatch and toSafeMatchView", () => {
  it("returns null without access, even when the row carries a score", () => {
    expect(gatedRowMatch(NO_MATCH_ACCESS, row("a", 90))).toBeNull();
    expect(gatedRowMatch({ enabled: false, companyProfileId: "cp" }, row("a", 90))).toBeNull();
  });
  it("returns the match for Pro access", () => {
    const view = gatedRowMatch({ enabled: true, companyProfileId: "cp" }, row("a", 90));
    expect(view?.score).toBe(90);
    expect(gatedRowMatch({ enabled: true, companyProfileId: "cp" }, row("a", null))).toBeNull();
  });
  it("has no free mode", () => {
    expect(toSafeMatchView.length).toBe(2);
  });
});

describe("toDealCardData", () => {
  it("omits match keys entirely without a score", () => {
    const card = toDealCardData(toPublicDealPreview(row("a", null) as never), null, null);
    expect(Object.keys(card)).not.toContain("matchScore");
    expect(Object.keys(card)).not.toContain("matchReasons");
    expect(Object.keys(toDealCardData(toPublicDealPreview(row("a", null) as never)))).not.toContain("matchScore");
  });
  it("keeps match keys for a Pro score", () => {
    const card = toDealCardData(toPublicDealPreview(row("a", 90) as never), 90, ["x"]);
    expect(card).toMatchObject({ matchScore: 90, matchReasons: ["x"] });
  });
});

describe("searchDealPreviewsForUser", () => {
  const params = { sort: "relevance", minScore: "90" };

  it("forces the default sort and drops minScore for free viewers", async () => {
    const out = await searchDealPreviewsForUser({ client, searchParams: params, userId: "u" });
    const args = previews.searchPublishedDealPreviews.mock.calls[0]![1];
    expect(args.sort).toBe("biddable");
    expect(args.minScore).toBeUndefined();
    expect(out.matchEnabled).toBe(false);
    expect(out.filters.sort).toBe("biddable");
    expect(out.result.items.every((i) => i.match === null)).toBe(true);
    for (const key of MATCH_KEYS) expect(keysDeep(out.result.items.map((i) => i.preview))).not.toContain(key);
  });

  it("falls back to a non-relevance defaultSort for free viewers", async () => {
    await searchDealPreviewsForUser({ client, searchParams: params, userId: "u", defaultSort: "updated" });
    expect(previews.searchPublishedDealPreviews.mock.calls[0]![1].sort).toBe("updated");
    await searchDealPreviewsForUser({ client, searchParams: {}, userId: "u", defaultSort: "relevance" });
    expect(previews.searchPublishedDealPreviews.mock.calls[1]![1].sort).toBe("biddable");
  });

  it("treats anonymous viewers like free viewers", async () => {
    const out = await searchDealPreviewsForUser({ client, searchParams: params, userId: null });
    expect(previews.searchPublishedDealPreviews.mock.calls[0]![1].sort).toBe("biddable");
    expect(out.result.items.every((i) => i.match === null)).toBe(true);
  });

  it("keeps relevance, minScore and scores for Pro viewers", async () => {
    entitlement.pro = true;
    const out = await searchDealPreviewsForUser({ client, searchParams: params, userId: "u" });
    const args = previews.searchPublishedDealPreviews.mock.calls[0]![1];
    expect(args.sort).toBe("relevance");
    expect(args.minScore).toBe(90);
    expect(out.matchEnabled).toBe(true);
    expect(out.result.items.map((i) => i.match?.score)).toEqual([90, 10]);
  });
});

describe("searchHomeLatestDealPreviews", () => {
  it("gives free viewers no match data", async () => {
    const out = await searchHomeLatestDealPreviews({ client, userId: "u" });
    expect(out.matchEnabled).toBe(false);
    expect(out.result.items.every((i) => i.match === null)).toBe(true);
  });
  it("gives Pro viewers match data", async () => {
    entitlement.pro = true;
    const out = await searchHomeLatestDealPreviews({ client, userId: "u" });
    expect(out.result.items[0]!.match?.score).toBe(90);
  });
});

describe("public deal detail", () => {
  it("gives anonymous and free viewers no match", async () => {
    expect((await getPublicDealPreviewPageBySlug(client, "a-1", { userId: null }))?.match).toBeNull();
    expect((await getPublicDealPreviewPageBySlug(client, "a-1", { userId: "u" }))?.match).toBeNull();
    expect((await getPublicDealPreviewPageByDealId(client, "deal-1", { userId: "u" }))?.match).toBeNull();
  });
  it("gives Pro viewers their match", async () => {
    entitlement.pro = true;
    expect((await getPublicDealPreviewPageBySlug(client, "a-1", { userId: "u" }))?.match?.score).toBe(90);
    expect((await getPublicDealPreviewPageByDealId(client, "deal-1", { userId: "u" }))?.match?.score).toBe(90);
  });
});
