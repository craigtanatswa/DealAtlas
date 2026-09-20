import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEAL_CARD_FIXTURES, DEAL_PREVIEW_DETAIL_FIXTURE, PROTECTED_FIELD_NAMES } from "@/components/deals/fixtures";
import { EMPTY_STATE_COPY } from "@/components/feedback/empty-state";

const ROOT = path.resolve(__dirname, "../..");
const DEAL_DIR = path.join(ROOT, "components/deals");

const CANARY_MARKERS = [
  "CANARY BUYER NEVER FREE",
  "canary-protected.example",
  "CANARY-REF-987654",
  "CANARY SOURCE TITLE NEVER FREE",
];

describe("design-system anti-bypass guards", () => {
  it("does not blur protected content in deal components", () => {
    const files = fs
      .readdirSync(DEAL_DIR)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

    for (const file of files) {
      const source = fs.readFileSync(path.join(DEAL_DIR, file), "utf8");
      expect(source).not.toMatch(/filter:\s*blur/);
      expect(source).not.toMatch(/\bblur-(?:sm|md|lg|xl)\b/);
    }

    const locked = fs.readFileSync(path.join(DEAL_DIR, "locked-field.tsx"), "utf8");
    expect(locked).not.toMatch(/\bvalue\s*[?:]/);
  });

  it("keeps fixtures free of protected canary markers and field names", () => {
    const serialized = JSON.stringify({
      cards: DEAL_CARD_FIXTURES,
      detail: DEAL_PREVIEW_DETAIL_FIXTURE,
    });

    for (const marker of CANARY_MARKERS) {
      expect(serialized).not.toContain(marker);
    }

    for (const fixture of Object.values(DEAL_CARD_FIXTURES)) {
      for (const fieldName of PROTECTED_FIELD_NAMES) {
        expect(fieldName in fixture).toBe(false);
      }
    }

    for (const fieldName of PROTECTED_FIELD_NAMES) {
      expect(fieldName in DEAL_PREVIEW_DETAIL_FIXTURE).toBe(false);
    }
  });

  it("does not invent live opportunity counts in empty-state copy", () => {
    const serialized = JSON.stringify(EMPTY_STATE_COPY);
    expect(serialized).not.toMatch(/\d[\d,]+\s+(live|opportunities|deals)/i);
  });

  it("spaces the public header into a wordmark, search, text links, and pill CTA", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "components/navigation/site-header.tsx"),
      "utf8",
    );
    expect(source).toContain("HeaderSearch");
    expect(source).toContain('path="/deals"');
    expect(source).toContain("HEADER_NAV_CLASS");
    expect(source).toContain('tone="bar"');
    expect(source).toContain("rounded-full");
    expect(source).toContain("HEADER_BAR_CLASS");
    const shell = fs.readFileSync(
      path.join(ROOT, "components/navigation/header-shell.ts"),
      "utf8",
    );
    expect(shell).toContain("HEADER_SEARCH_CLASS");
    expect(shell).toContain("gap-x-7");
    const search = fs.readFileSync(
      path.join(ROOT, "components/navigation/header-search.tsx"),
      "utf8",
    );
    expect(search).toContain('name="q"');
    expect(search).toContain('method="get"');
  });

  it("ships the DealAtlas wordmark through BrandMark", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "components/navigation/brand-mark.tsx"),
      "utf8",
    );
    expect(source).toContain("/brand/dealatlas-logo.png");
    expect(
      fs.existsSync(path.join(ROOT, "public/brand/dealatlas-logo.png")),
    ).toBe(true);
  });

  it("applies interface polish tokens in the existing Tailwind system", () => {
    const heading = fs.readFileSync(
      path.join(ROOT, "components/layout/heading.tsx"),
      "utf8",
    );
    const button = fs.readFileSync(
      path.join(ROOT, "components/ui/button.tsx"),
      "utf8",
    );
    const badge = fs.readFileSync(
      path.join(ROOT, "components/ui/badge.tsx"),
      "utf8",
    );
    const matchScore = fs.readFileSync(
      path.join(ROOT, "components/deals/match-score.tsx"),
      "utf8",
    );
    const searchForm = fs.readFileSync(
      path.join(ROOT, "components/deals/deal-keyword-form.tsx"),
      "utf8",
    );

    expect(heading).toContain("text-balance");
    expect(heading).toContain("text-pretty");
    expect(button).toContain("scale-[0.96]");
    expect(button).not.toContain("transition-all");
    expect(badge).not.toContain("transition-all");
    expect(matchScore).toContain("tabular-nums");
    expect(searchForm).toContain("rounded-[1rem]");
    expect(searchForm).toContain("rounded-[1.25rem]");
  });

  it("hides dummy stories on Vercel and the public hostname", () => {
    const page = fs.readFileSync(
      path.join(ROOT, "app/(marketing)/design-system/page.tsx"),
      "utf8",
    );
    expect(page).toContain("shouldHideDesignSystem");
    expect(page).toContain("notFound");
    expect(page).toContain("process.env.NODE_ENV");
    expect(page).toContain("process.env.VERCEL");
  });

  it("keeps the public hero search and decorative category cloud separate from deal data", () => {
    const hero = fs.readFileSync(
      path.join(ROOT, "components/marketing/home-sections.tsx"),
      "utf8",
    );
    const cloud = fs.readFileSync(
      path.join(ROOT, "components/marketing/hero-category-cloud.tsx"),
      "utf8",
    );

    expect(hero).toContain("Find opportunities worth pursuing.");
    expect(hero).toContain("HeroSearchForm");
    expect(hero).toContain("HeroCategoryCloud");
    expect(hero).not.toContain("use client");
    expect(cloud).toContain('"use client"');
    expect(cloud).toContain("pointer-events-none");
    expect(cloud).toContain('aria-hidden="true"');
    expect(cloud).toContain("useReducedMotion");
    expect(cloud).toContain("DEAL_CATEGORY_CATALOG");
    expect(cloud).not.toMatch(/supabase|searchDealPreviews|fetch\(/);
  });

  it("keeps homepage testimonials as replaceable placeholders below opportunities", () => {
    const page = fs.readFileSync(
      path.join(ROOT, "app/(marketing)/page.tsx"),
      "utf8",
    );
    const data = fs.readFileSync(
      path.join(ROOT, "components/marketing/testimonial-data.ts"),
      "utf8",
    );
    const carousel = fs.readFileSync(
      path.join(ROOT, "components/marketing/testimonial-carousel.tsx"),
      "utf8",
    );
    const hero = fs.readFileSync(
      path.join(ROOT, "components/marketing/home-sections.tsx"),
      "utf8",
    );

    expect(page).toContain("HomeOpportunitySections");
    expect(page).toContain("searchHomeLatestDealPreviews");
    expect(page).toContain("HomeTestimonialsSection");
    expect(page.indexOf("HomeOpportunitySections")).toBeLessThan(
      page.indexOf("HomeTestimonialsSection"),
    );
    expect(data).toContain(
      "Placeholder testimonial content — replace with verified customer",
    );
    expect(data).toContain("Daniel Mercer");
    expect(data).not.toMatch(/10,000\+|£50M|4\.9\/5/);
    expect(carousel).toContain('"use client"');
    expect(carousel).toContain("useReducedMotion");
    expect(carousel).not.toMatch(/supabase|searchDealPreviews|fetch\(/);
    expect(hero).toContain('href="/deals"');
    expect(hero).toContain("Find opportunities for your business");
    expect(hero).toContain("Open and upcoming opportunities first");
    expect(hero).not.toContain("use client");
  });
});
