import fs from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DealCard } from "@/components/deals/deal-card";
import { RelatedDeals } from "@/components/deals/related-deals";
import { cardDataFromPublicCardPreview } from "@/components/deals/types";
import type { PublicCardPreview } from "@/lib/deals/public-card-types";
import {
  categoryLandingForRawCategory,
  getCategoryLanding,
} from "@/lib/seo/category-landings";
import { breadcrumbJsonLd } from "@/lib/seo/json-ld";

const ROOT = path.resolve(__dirname, "../..");
const ORIGIN = "https://www.dealatlas.uk";
const FORBIDDEN_PLAN_WORD = ["found", "ing"].join("");

function preview(slug: string, overrides: Partial<PublicCardPreview> = {}): PublicCardPreview {
  return {
    slug,
    previewTitle: `Sanitised title for ${slug}`,
    mainCategory: "Construction & Infrastructure",
    broadRegion: "Wales",
    valueBand: "£250k–£500k",
    deadlineBand: "Within 3 weeks",
    ...overrides,
  };
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!);
}

describe("compact deal card", () => {
  it("renders only the public preview fields and a plain deal link", () => {
    const item = preview("compact-deal");
    const html = renderToStaticMarkup(
      <DealCard compact deal={cardDataFromPublicCardPreview(item)} />,
    );

    expect(html).toContain(item.previewTitle);
    expect(html).toContain("Construction &amp; Infrastructure");
    expect(html).toContain("Wales");
    expect(html).toContain("£250k–£500k");
    expect(html).toContain("Within 3 weeks");
    expect(html).toContain('href="/deals/compact-deal"');
    expect(html).toContain("View opportunity");
    expect(hrefs(html).every((href) => href === "/deals/compact-deal")).toBe(true);
    expect(html).not.toContain("?");
    expect(html).not.toMatch(/Other buyer/i);
    expect(html).not.toContain("previewSummary");
    expect(html).not.toContain("Match");
  });
});

describe("related deals", () => {
  it("links only to plain deal paths and the hub", () => {
    const deals = [
      preview("related-one"),
      preview("related-two"),
      preview("related-three"),
      preview("related-four"),
    ];
    const html = renderToStaticMarkup(
      <RelatedDeals
        deals={deals}
        heading="More Construction & Infrastructure opportunities"
        hub={{ name: "Construction & Infrastructure", path: "/categories/construction-infrastructure" }}
      />,
    );

    expect(html).toContain("data-related-deals");
    expect(html).toContain("See all open Construction &amp; Infrastructure tenders");
    for (const href of hrefs(html)) {
      expect(
        /^\/deals\/[a-z0-9-]+$/.test(href) ||
          href === "/categories/construction-infrastructure",
        href,
      ).toBe(true);
      expect(href).not.toContain("?");
      expect(href).not.toMatch(/utm_/i);
    }
  });

  it("renders nothing with fewer than three deals", () => {
    const html = renderToStaticMarkup(
      <RelatedDeals
        deals={[preview("one"), preview("two")]}
        heading="More opportunities"
        hub={null}
      />,
    );

    expect(html).toBe("");
  });
});

describe("deal breadcrumb JSON-LD", () => {
  it("contains only BreadcrumbList keys and Home, Deals, hub and title names", () => {
    const hub = getCategoryLanding("construction-infrastructure")!;
    const title = "Sanitised construction opportunity";
    const jsonLd = breadcrumbJsonLd(ORIGIN, [
      { name: "Home", path: "/" },
      { name: "Deals", path: "/deals" },
      { name: hub.name, path: hub.path },
      { name: title, path: "/deals/sanitised-construction-opportunity" },
    ]);

    expect(Object.keys(jsonLd).sort()).toEqual([
      "@context",
      "@type",
      "itemListElement",
    ]);
    const items = jsonLd.itemListElement as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        "@type",
        "item",
        "name",
        "position",
      ]);
    }
    expect(items.map((item) => item.name)).toEqual([
      "Home",
      "Deals",
      hub.name,
      title,
    ]);
  });
});

describe("priority hub copy", () => {
  const expected = {
    "construction-infrastructure": {
      title: "Construction tenders UK: open public construction bids",
      description:
        "Open construction tenders UK and public construction bids for building, civils, repair and infrastructure, by region and value band on DealAtlas.",
      h1: "Construction tenders in the UK",
    },
    technology: {
      title: "IT tenders UK: software, cyber and digital contracts",
      description:
        "Live IT tenders UK: software, cyber security, managed IT and digital contracts, listed by region and value band on DealAtlas.",
      h1: "IT tenders in the UK",
    },
    "professional-services": {
      title: "Architecture, engineering and professional services tenders UK",
      description:
        "Architecture, engineering and professional services tenders UK: design, inspection, consultancy, audit and legal contracts, by region and value band on DealAtlas.",
      h1: "Architecture, engineering and professional services tenders in the UK",
    },
  } as const;

  it("matches the approved title, description and H1 strings", () => {
    for (const [slug, copy] of Object.entries(expected)) {
      const landing = getCategoryLanding(slug)!;
      expect(landing.title).toBe(copy.title);
      expect(landing.description).toBe(copy.description);
      expect(landing.h1).toBe(copy.h1);
      for (const text of [landing.title, landing.description, landing.h1 ?? ""]) {
        expect(text.toLowerCase()).not.toContain(FORBIDDEN_PLAN_WORD);
        expect(text).not.toContain("£");
        expect(text).not.toContain("Limited places");
      }
    }
  });

  it("maps a raw category onto its hub", () => {
    expect(categoryLandingForRawCategory("Construction")?.slug).toBe(
      "construction-infrastructure",
    );
    expect(categoryLandingForRawCategory("Technology")?.slug).toBe("technology");
    expect(categoryLandingForRawCategory("not a category")).toBeNull();
  });
});

describe("guide hub links", () => {
  const read = (file: string) =>
    fs.readFileSync(path.join(ROOT, "content", "guides", file), "utf8");

  it("points construction and infrastructure anchors at the hub", () => {
    const source = read("construction-tenders-uk.md");
    expect(source).toMatch(
      /\[[^\]]*open construction tenders UK[^\]]*\]\(\/categories\/construction-infrastructure\)/,
    );
  });

  it("points the IT guide primary browse link at the technology hub", () => {
    const source = read("it-tenders-uk.md");
    expect(source).toContain("[live IT tenders UK](/categories/technology)");
  });

  it("points the financial services guide at professional services", () => {
    const source = read("financial-services-tenders-uk.md");
    expect(source).toContain(
      "[professional services tenders UK](/categories/professional-services)",
    );
  });
});
