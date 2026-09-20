import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEAL_PREVIEW_DETAIL_FIXTURE } from "@/components/deals/fixtures";
import { toPublicDealPreview } from "@/lib/search/dto";
import {
  missingPublicDealPreviewMetadata,
  publicDealPreviewMetadata,
  publicDealsIndexMetadata,
} from "@/lib/search/metadata";
import {
  getMeasurementConfig,
  publicAnalyticsContext,
} from "@/lib/seo/analytics";
import {
  getCategoryLanding,
  indexableCategoryLandings,
} from "@/lib/seo/category-landings";
import { evaluatePublicIndexability } from "@/lib/seo/indexability";
import {
  breadcrumbJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  webPageJsonLd,
} from "@/lib/seo/json-ld";
import { marketingPageMetadata } from "@/lib/seo/metadata";
import { PUBLIC_INDEXABLE_PATHS, PUBLIC_PAGE_COPY } from "@/lib/seo/pages";
import { buildRobotsPolicy, staticSitemapEntries } from "@/lib/seo/sitemap";
import {
  findForbiddenPublicKeys,
  findProtectedMarkerLeaks,
  SEEDED_PROTECTED_MARKERS,
} from "../helpers/protected-leak";

const ORIGIN = "http://localhost:3000";
const ROOT = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("public indexability policy", () => {
  it("indexes a unique published LOW-risk preview", () => {
    const decision = evaluatePublicIndexability({
      kind: "deal-preview",
      published: true,
      leakageRisk: "LOW",
      preview: DEAL_PREVIEW_DETAIL_FIXTURE,
    });
    expect(decision).toEqual({ index: true, follow: true, reason: "ok" });
  });

  it("does not index unpublished or non-LOW previews", () => {
    expect(
      evaluatePublicIndexability({
        kind: "deal-preview",
        published: false,
        leakageRisk: "LOW",
        preview: DEAL_PREVIEW_DETAIL_FIXTURE,
      }).reason,
    ).toBe("unpublished");
    expect(
      evaluatePublicIndexability({
        kind: "deal-preview",
        published: true,
        leakageRisk: "HIGH",
        preview: DEAL_PREVIEW_DETAIL_FIXTURE,
      }).reason,
    ).toBe("leak-risk");
  });

  it("does not index thin or withdrawn previews", () => {
    expect(
      evaluatePublicIndexability({
        kind: "deal-preview",
        published: true,
        leakageRisk: "LOW",
        preview: {
          ...DEAL_PREVIEW_DETAIL_FIXTURE,
          previewTitle: "Opportunity",
          previewSummary: "A sanitised summary.",
        },
      }).reason,
    ).toBe("thin");
    expect(
      evaluatePublicIndexability({
        kind: "deal-preview",
        published: true,
        leakageRisk: "LOW",
        preview: { ...DEAL_PREVIEW_DETAIL_FIXTURE, status: "WITHDRAWN" },
      }).reason,
    ).toBe("duplicate");
  });

  it("does not index internal or filtered search URLs", () => {
    expect(
      evaluatePublicIndexability({ kind: "internal" }),
    ).toEqual({ index: false, follow: false, reason: "internal" });
    expect(
      evaluatePublicIndexability({
        kind: "search",
        hasSearchFilters: true,
        searchPage: 1,
      }).reason,
    ).toBe("search-url");
    expect(
      evaluatePublicIndexability({
        kind: "search",
        hasSearchFilters: false,
        searchPage: 2,
      }).reason,
    ).toBe("search-url");
    expect(
      evaluatePublicIndexability({
        kind: "search",
        hasSearchFilters: false,
        searchPage: 1,
      }).index,
    ).toBe(true);
  });
});

describe("representative public page metadata", () => {
  it("gives homepage, pricing, and how-it-works canonicals and OpenGraph", () => {
    for (const page of [
      PUBLIC_PAGE_COPY.home,
      PUBLIC_PAGE_COPY.pricing,
      PUBLIC_PAGE_COPY.howItWorks,
      PUBLIC_PAGE_COPY.contact,
    ]) {
      const metadata = marketingPageMetadata({
        title: page.title,
        description: page.description,
        path: page.path,
        origin: ORIGIN,
        absoluteTitle: page.path === "/",
      });
      const serialized = JSON.stringify(metadata);
      expect(metadata.alternates?.canonical).toBe(
        page.path === "/" ? ORIGIN : `${ORIGIN}${page.path}`,
      );
      expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical);
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
      expect(findForbiddenPublicKeys(metadata)).toEqual([]);
    }
  });

  it("canonicalises filtered Find deals URLs to the unfiltered index and noindexes them", () => {
    const metadata = publicDealsIndexMetadata({
      hasFilters: true,
      page: 1,
      canonicalUrl: `${ORIGIN}/deals`,
    });
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/deals`);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(findProtectedMarkerLeaks(JSON.stringify(metadata))).toEqual([]);
  });

  it("keeps unpublished deal metadata off the index", () => {
    const metadata = missingPublicDealPreviewMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(findProtectedMarkerLeaks(JSON.stringify(metadata))).toEqual([]);
  });

  it("does not copy protected keys into deal OpenGraph metadata", () => {
    const dto = toPublicDealPreview({
      deal_id: "22222222-2222-4222-8222-222222222222",
      slug: "managed-it-support-preview",
      preview_title: "Managed IT support for a public organisation",
      preview_summary:
        "A public organisation needs ongoing technology support without exposing source identity.",
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
      relevance_tags: ["it-support"],
      freshness_label: "Recently added",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      source_title: "CANARY SOURCE TITLE NEVER FREE",
      source_url: "https://canary-source.example/notice",
    } as never);
    const metadata = publicDealPreviewMetadata(
      dto,
      `${ORIGIN}/deals/${dto.slug}`,
    );
    const serialized = JSON.stringify(metadata);
    expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
    expect(serialized).not.toContain("source_title");
    expect(serialized).not.toContain("source_url");
  });
});

describe("sitemaps, robots and category architecture", () => {
  it("blocks internal app, admin, auth and filtered deals URLs in robots", () => {
    const robots = buildRobotsPolicy(ORIGIN);
    const disallow = robots.rules && !Array.isArray(robots.rules)
      ? robots.rules.disallow
      : [];
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/app",
        "/app/",
        "/admin",
        "/admin/",
        "/api/",
        "/auth/",
        "/checkout/",
        "/login",
        "/deals?",
      ]),
    );
    expect(robots.sitemap).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/sitemap.xml`,
        `${ORIGIN}/deals/sitemap.xml`,
      ]),
    );
    expect(robots.host).toBe("localhost:3000");
  });

  it("lists only curated public URLs in the static sitemap", () => {
    const entries = staticSitemapEntries(ORIGIN);
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        ORIGIN,
        `${ORIGIN}/pricing`,
        `${ORIGIN}/how-it-works`,
        `${ORIGIN}/contact`,
        `${ORIGIN}/privacy`,
        `${ORIGIN}/categories`,
        `${ORIGIN}/categories/technology`,
      ]),
    );
    expect(urls.some((url) => url.includes("/app"))).toBe(false);
    expect(urls.some((url) => url.includes("/admin"))).toBe(false);
    expect(urls.some((url) => url.includes("?"))).toBe(false);
    expect(urls.some((url) => url.includes("/categories/other"))).toBe(false);
    expect(findProtectedMarkerLeaks(JSON.stringify(entries))).toEqual([]);
  });

  it("does not mass-generate category landings from search filters", () => {
    const landings = indexableCategoryLandings();
    expect(landings.every((item) => item.slug !== "other")).toBe(true);
    expect(getCategoryLanding("technology")?.path).toBe("/categories/technology");
    expect(getCategoryLanding("not-a-real-category")).toBeNull();
    expect(read("app/(marketing)/categories/[slug]/page.tsx")).toContain(
      "generateStaticParams",
    );
    expect(read("app/(marketing)/categories/[slug]/page.tsx")).toContain(
      "dynamicParams = false",
    );
    expect(read("app/(marketing)/categories/[slug]/page.tsx")).toContain(
      "indexableCategoryLandings",
    );
  });

  it("keeps required public indexable paths documented", () => {
    expect(PUBLIC_INDEXABLE_PATHS).toEqual(
      expect.arrayContaining([
        "/",
        "/deals",
        "/pricing",
        "/how-it-works",
        "/contact",
        "/privacy",
        "/terms",
        "/cookies",
      ]),
    );
  });
});

describe("JSON-LD and analytics hooks", () => {
  it("serialises WebPage JSON-LD without identifying tender schemas", () => {
    const jsonLd = webPageJsonLd({
      origin: ORIGIN,
      path: "/deals/managed-it-support-preview",
      name: DEAL_PREVIEW_DETAIL_FIXTURE.previewTitle,
      description: DEAL_PREVIEW_DETAIL_FIXTURE.previewSummary,
    });
    const serialized = serializeJsonLd(jsonLd);
    expect(serialized).toContain(DEAL_PREVIEW_DETAIL_FIXTURE.previewTitle);
    expect(organizationJsonLd(ORIGIN).logo).toBe(
      `${ORIGIN}/brand/dealatlas-logo.png`,
    );
    expect(serialized).not.toContain("JobPosting");
    expect(serialized).not.toContain("source_url");
    expect(findProtectedMarkerLeaks(serialized)).toEqual([]);
    expect(() =>
      serializeJsonLd({
        ...organizationJsonLd(ORIGIN),
        sourceUrl: "https://canary-source.example/notice",
      }),
    ).toThrow(/protected key/);
    expect(
      findProtectedMarkerLeaks(
        serializeJsonLd(
          breadcrumbJsonLd(ORIGIN, [
            { name: "Home", path: "/" },
            { name: "Find deals", path: "/deals" },
          ]),
        ),
      ),
    ).toEqual([]);
  });

  it("drops buyer and source identity from analytics context", () => {
    expect(
      publicAnalyticsContext({
        path: "/deals/example-slug",
        previewSlug: "example-slug",
        sourceUrl: "https://canary-source.example/notice",
        buyerName: "CANARY BUYER NEVER FREE",
        sourceTitle: "CANARY SOURCE TITLE NEVER FREE",
      }),
    ).toEqual({
      path: "/deals/example-slug",
      previewSlug: "example-slug",
    });
    const config = getMeasurementConfig({
      NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "token",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC123DEF",
      NEXT_PUBLIC_GTM_ID: "GTM-ABC123",
    });
    expect(config.gtmId).toBe("GTM-ABC123");
    expect(config.gaMeasurementId).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain("canary");
  });

  it("escapes script breakouts in JSON-LD HTML payloads", () => {
    const serialized = serializeJsonLd(
      webPageJsonLd({
        origin: ORIGIN,
        path: "/deals",
        name: "Find deals",
        description: "</script><script>alert(1)</script>",
      }),
    );
    expect(serialized).toContain("\\u003c/script>");
    expect(serialized).not.toContain("</script>");
  });
});

describe("internal routes and legal review markers", () => {
  it("noindexes app, admin, auth and checkout success layouts", () => {
    expect(read("app/(app)/app/layout.tsx")).toContain("NOINDEX_ROBOTS");
    expect(read("app/(auth)/layout.tsx")).toContain("NOINDEX_ROBOTS");
    expect(read("app/(admin)/admin/layout.tsx")).toContain("index: false");
    expect(read("app/(marketing)/checkout/success/page.tsx")).toContain(
      "index: false",
    );
  });

  it("marks privacy, terms, cookies and contact copy for legal review", () => {
    expect(read("components/legal/legal-review-callout.tsx")).toContain(
      "Requires final business/legal review",
    );
    expect(read("components/legal/legal-document.tsx")).toContain(
      "Requires final business/legal review",
    );
    expect(read("app/(marketing)/contact/page.tsx")).toContain("LegalReviewCallout");
    for (const file of [
      "app/(marketing)/privacy/page.tsx",
      "app/(marketing)/terms/page.tsx",
      "app/(marketing)/cookies/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("LegalDocument");
      expect(source).toContain("review");
      expect(findProtectedMarkerLeaks(source)).toEqual([]);
    }
  });

  it("does not embed seeded protected markers in SEO modules", () => {
    const seoDir = path.join(ROOT, "lib/seo");
    const files = fs.readdirSync(seoDir);
    for (const file of files) {
      const source = fs.readFileSync(path.join(seoDir, file), "utf8");
      for (const marker of SEEDED_PROTECTED_MARKERS) {
        expect(source, file).not.toContain(marker);
      }
    }
  });
});
