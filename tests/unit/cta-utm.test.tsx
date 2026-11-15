// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { DealPreviewDetail } from "@/components/deals/deal-preview-detail";
import { GuideMarkdown } from "@/components/guides/guide-markdown";
import {
  CTA_UTM,
  DEAL_PAGE_UTM_CONTENT,
  ctaUtmQuery,
  withCtaUtm,
} from "@/lib/analytics/cta-utm";
import { parseCheckoutPlan, sanitizeRedirectPath } from "@/lib/auth/redirect";
import {
  DEAL_PAGE_LIFETIME_SIGNUP_HREF,
  dealPagePlanSignupHref,
} from "@/lib/deals/deal-cta";
import {
  GUIDES_DIR,
  getPublishedGuide,
  publishedGuidePaths,
} from "@/lib/guides/content";
import { toPublicDealPreview, type PreviewDtoFields } from "@/lib/search/dto";

const ORIGIN = "https://dealatlas.co.uk";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
const OPEN = { offered: true, sold_out: false } as const;
const SOLD_OUT = { offered: true, sold_out: true } as const;

afterEach(cleanup);

type DealFixture = PreviewDtoFields & { id: string; buyer_name: string };

const DEAL_A: DealFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  buyer_name: "Bristol City Council",
  slug: "welsh-bridge-maintenance-a1b2c3",
  preview_title: "Bridge maintenance for a public organisation",
  preview_summary: "A public organisation is procuring bridge maintenance.",
  deal_type: "PUBLIC_TENDER",
  buyer_sector: "PUBLIC",
  buyer_type: "PUBLIC",
  stage: "LIVE",
  status: "OPEN",
  main_category: "Construction & Infrastructure",
  broad_region: "Wales",
  value_band: "£1m–£5m",
  deadline_band: "Within 30 days",
  duration_band: "3–5 years",
  sme_suitability: "HIGH",
  bid_complexity: "LOW",
  competition_level: "UNKNOWN",
  requirements_preview: ["relevant bridge maintenance experience"],
  relevance_tags: ["bridges"],
  freshness_label: null,
};

const DEAL_B: DealFixture = {
  id: "22222222-2222-4222-8222-222222222222",
  buyer_name: "Acme Health Trust",
  slug: "north-west-data-platform-d4e5f6",
  preview_title: "Data platform for a private organisation",
  preview_summary: "A private organisation is procuring a data platform.",
  deal_type: "PRIVATE_TENDER",
  buyer_sector: "PRIVATE",
  buyer_type: "PRIVATE",
  stage: "LIVE",
  status: "OPEN",
  main_category: "Technology",
  broad_region: "North West England",
  value_band: "£250k–£500k",
  deadline_band: "Within 3 weeks",
  duration_band: "1–2 years",
  sme_suitability: "MEDIUM",
  bid_complexity: "MEDIUM",
  competition_level: "LOW",
  requirements_preview: ["relevant data platform experience"],
  relevance_tags: ["data"],
  freshness_label: null,
};

function utmHrefs(deal: DealFixture, soldOut: boolean): string[] {
  const view = render(
    <DealPreviewDetail
      deal={toPublicDealPreview(deal)}
      unlock={{
        mode: "anonymous",
        founding: soldOut ? SOLD_OUT : OPEN,
      }}
    />,
  );
  const hrefs = Array.from(view.container.querySelectorAll("a[href]"))
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => href.includes("utm_"));
  view.unmount();
  return hrefs;
}

function allDealHrefs(deal: DealFixture): string[] {
  return [...utmHrefs(deal, false), ...utmHrefs(deal, true)];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function isInternalPathWithoutUtm(pathname: string): boolean {
  return (
    pathname === "/signup" ||
    pathname === "/deals" ||
    pathname.startsWith("/deals/") ||
    pathname.startsWith("/guides/") ||
    pathname.startsWith("/categories/") ||
    pathname.startsWith("/regions/")
  );
}

function expectGuideHrefs(hrefs: string[], slug: string): void {
  for (const rawHref of hrefs) {
    const href = decodeHtml(rawHref);
    expect(href).not.toMatch(/founding/i);
    const url = new URL(href, ORIGIN);

    if (url.pathname === "/pricing") {
      expect(href).toBe(`/pricing?${ctaUtmQuery(slug)}`);
      expect(url.searchParams.get("utm_source")).toBe(CTA_UTM.utm_source);
      expect(url.searchParams.get("utm_medium")).toBe(CTA_UTM.utm_medium);
      expect(url.searchParams.get("utm_campaign")).toBe(CTA_UTM.utm_campaign);
      expect(url.searchParams.get("utm_content")).toBe(slug);
      expect(
        [...url.searchParams.keys()].filter((key) => key.startsWith("utm_")).sort(),
      ).toEqual([...UTM_KEYS].sort());
    } else if (isInternalPathWithoutUtm(url.pathname)) {
      expect(href).not.toContain("utm_");
    }
  }
}

const GUIDE_SLUGS = [
  "council-tenders-uk",
  "how-to-find-public-sector-tenders",
  "how-to-win-council-contracts",
  "transport-logistics-tenders-uk",
  "uk-tender-search",
  "financial-services-tenders-uk",
  "it-tenders-uk",
] as const;

describe("deal page CTA UTMs", () => {
  it("uses the same deal-page UTMs for every signed-out deal", () => {
    const first = allDealHrefs(DEAL_A);
    const second = allDealHrefs(DEAL_B);

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);

    const markers = [
      DEAL_A.id,
      DEAL_A.slug,
      DEAL_A.main_category,
      DEAL_A.broad_region,
      DEAL_A.buyer_name,
      DEAL_B.id,
      DEAL_B.slug,
      DEAL_B.main_category,
      DEAL_B.broad_region,
      DEAL_B.buyer_name,
    ]
      .filter((marker): marker is string => Boolean(marker))
      .map((marker) => marker.toLowerCase());

    for (const href of first) {
      expect(href).not.toMatch(/founding/i);
      const url = new URL(href, ORIGIN);
      expect(url.pathname).toBe("/signup");
      expect(url.searchParams.get("utm_source")).toBe(CTA_UTM.utm_source);
      expect(url.searchParams.get("utm_medium")).toBe(CTA_UTM.utm_medium);
      expect(url.searchParams.get("utm_campaign")).toBe(CTA_UTM.utm_campaign);
      expect(url.searchParams.get("utm_content")).toBe(DEAL_PAGE_UTM_CONTENT);
      expect(
        [...url.searchParams.keys()].filter((key) => key.startsWith("utm_")).sort(),
      ).toEqual([...UTM_KEYS].sort());

      const raw = href.toLowerCase();
      const decoded = decodeURIComponent(href).toLowerCase();
      for (const marker of markers) {
        expect(raw).not.toContain(marker);
        expect(decoded).not.toContain(marker);
      }
    }

    const decoded = first.map((href) => decodeURIComponent(href)).join("\n");
    expect(decoded).toContain("/checkout?plan=lifetime");
    expect(decoded).toContain("/checkout?plan=PRO_MONTHLY");
    expect(decoded).toContain("/checkout?plan=PRO_ANNUAL");
  });

  it("keeps the lifetime destination behind signup", () => {
    const hrefs = allDealHrefs(DEAL_A);
    const lifetimeHref = hrefs.find((href) => {
      const next = new URL(href, ORIGIN).searchParams.get("next");
      return next
        ? new URL(next, ORIGIN).searchParams.get("plan") === "lifetime"
        : false;
    });

    expect(lifetimeHref).toBeTruthy();
    expect(lifetimeHref).toBe(DEAL_PAGE_LIFETIME_SIGNUP_HREF);

    const url = new URL(lifetimeHref!, ORIGIN);
    const next = url.searchParams.get("next");
    expect(next).toBe(
      "/checkout?plan=lifetime&utm_source=dealatlas&utm_medium=organic&utm_campaign=lifetime&utm_content=deal-page",
    );
    expect(sanitizeRedirectPath(next)).toBe(next);
    expect(new URL(next!, ORIGIN).searchParams.get("plan")).toBe("lifetime");
  });

  it.each(["PRO_MONTHLY", "PRO_ANNUAL"] as const)(
    "keeps the %s plan on signup and inside checkout",
    (plan) => {
      const href = allDealHrefs(DEAL_A).find(
        (candidate) =>
          new URL(candidate, ORIGIN).searchParams.get("plan") === plan,
      );

      expect(href).toBeTruthy();
      expect(href).toBe(dealPagePlanSignupHref(plan));

      const url = new URL(href!, ORIGIN);
      expect(url.searchParams.get("plan")).toBe(plan);
      expect(parseCheckoutPlan(url.searchParams.get("plan"))).toBe(plan);

      const next = url.searchParams.get("next");
      expect(next).toBe(
        `/checkout?plan=${plan}&utm_source=dealatlas&utm_medium=organic&utm_campaign=lifetime&utm_content=deal-page`,
      );
      expect(sanitizeRedirectPath(next)).toBe(next);
      const nextUrl = new URL(next!, ORIGIN);
      expect(nextUrl.searchParams.get("plan")).toBe(plan);
      expect(parseCheckoutPlan(nextUrl.searchParams.get("plan"))).toBe(plan);
    },
  );
});

describe("guide pricing links", () => {
  it.each(GUIDE_SLUGS)(
    "only puts the organic lifetime UTMs on /pricing links in %s",
    (slug) => {
      const source = fs.readFileSync(
        path.join(GUIDES_DIR, `${slug}.md`),
        "utf8",
      );
      const rawHrefs = [...source.matchAll(/\]\(([^)\s]+)\)/g)].map(
        (match) => match[1]!,
      );
      expectGuideHrefs(rawHrefs, slug);

      const guide = getPublishedGuide(slug);
      expect(guide).toBeTruthy();
      const html = renderToStaticMarkup(
        <GuideMarkdown
          blocks={guide!.blocks}
          publishedGuidePaths={publishedGuidePaths()}
        />,
      );
      const renderedHrefs = [...html.matchAll(/href="([^"]*)"/g)].map(
        (match) => match[1]!,
      );
      expectGuideHrefs(renderedHrefs, slug);

      const pricingHrefs = renderedHrefs.filter(
        (href) => new URL(decodeHtml(href), ORIGIN).pathname === "/pricing",
      );
      expect(pricingHrefs.length).toBeGreaterThan(0);
    },
  );
});

describe("CTA UTM helpers", () => {
  it("builds the exact query in the required key order", () => {
    expect(ctaUtmQuery("deal-page")).toBe(
      "utm_source=dealatlas&utm_medium=organic&utm_campaign=lifetime&utm_content=deal-page",
    );
    expect(ctaUtmQuery("uk-tender-search")).toBe(
      "utm_source=dealatlas&utm_medium=organic&utm_campaign=lifetime&utm_content=uk-tender-search",
    );
  });

  it("appends to a path with or without an existing query and keeps the hash last", () => {
    expect(withCtaUtm("/pricing", "council-tenders-uk")).toBe(
      `/pricing?${ctaUtmQuery("council-tenders-uk")}`,
    );
    expect(withCtaUtm("/checkout?plan=lifetime", "deal-page")).toBe(
      `/checkout?plan=lifetime&${ctaUtmQuery("deal-page")}`,
    );
    expect(withCtaUtm("/pricing#faq", "uk-tender-search")).toBe(
      `/pricing?${ctaUtmQuery("uk-tender-search")}#faq`,
    );
    expect(withCtaUtm("/pricing?ref=nav#faq", "it-tenders-uk")).toBe(
      `/pricing?ref=nav&${ctaUtmQuery("it-tenders-uk")}#faq`,
    );
  });

  it("builds the signed-out deal page lifetime href once", () => {
    expect(DEAL_PAGE_LIFETIME_SIGNUP_HREF).toBe(
      "/signup?next=%2Fcheckout%3Fplan%3Dlifetime%26utm_source%3Ddealatlas%26utm_medium%3Dorganic%26utm_campaign%3Dlifetime%26utm_content%3Ddeal-page&utm_source=dealatlas&utm_medium=organic&utm_campaign=lifetime&utm_content=deal-page",
    );
  });
});
